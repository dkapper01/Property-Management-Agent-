import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { redirect, Link, useFetcher } from 'react-router'
import { Icon } from '#app/components/ui/icon.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { generateTOTP } from '#app/utils/totp.server.ts'
import { type Route } from './+types/index.ts'
import { twoFAVerificationType } from './_layout.tsx'
import { twoFAVerifyVerificationType } from './verify.tsx'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const verification = await prisma.verification.findUnique({
		where: { target_type: { type: twoFAVerificationType, target: userId } },
		select: { id: true },
	})
	return { is2FAEnabled: Boolean(verification) }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const { otp: _otp, ...config } = await generateTOTP()
	const verificationData = {
		...config,
		type: twoFAVerifyVerificationType,
		target: userId,
	}
	await prisma.verification.upsert({
		where: {
			target_type: { target: userId, type: twoFAVerifyVerificationType },
		},
		create: verificationData,
		update: verificationData,
	})
	return redirect('/settings/profile/two-factor/verify')
}

export default function TwoFactorRoute({ loaderData }: Route.ComponentProps) {
	const enable2FAFetcher = useFetcher<typeof action>()

	return (
		<section className="max-w-md">
			<h2 className="text-body-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
				Two-factor authentication
			</h2>
			<p className="mt-2 text-body-2xs text-muted-foreground">
				Add an extra layer of security to your account.
			</p>
			<div className="mt-4 flex flex-col gap-4 text-body-sm">
				{loaderData.is2FAEnabled ? (
					<>
						<p className="text-body-sm text-muted-foreground">
							<Icon name="check">Two-factor authentication is enabled.</Icon>
						</p>
						<Link to="disable" className="text-body-2xs text-muted-foreground hover:text-foreground">
							Disable 2FA
						</Link>
					</>
				) : (
					<>
						<p className="text-body-sm text-muted-foreground">
							<Icon name="lock-open-1">
								Two-factor authentication is not enabled yet.
							</Icon>
						</p>
						<p className="text-body-2xs text-muted-foreground">
							Two factor authentication adds an extra layer of security to your
							account. You will need to enter a code from an authenticator app
							like{' '}
							<a className="underline" href="https://1password.com/">
								1Password
							</a>{' '}
							to log in.
						</p>
						<enable2FAFetcher.Form method="POST">
							<StatusButton
								type="submit"
								name="intent"
								value="enable"
								status={enable2FAFetcher.state === 'loading' ? 'pending' : 'idle'}
							>
								Enable 2FA
							</StatusButton>
						</enable2FAFetcher.Form>
					</>
				)}
			</div>
		</section>
	)
}
