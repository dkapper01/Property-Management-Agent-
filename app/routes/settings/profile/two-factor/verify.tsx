import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import * as QRCode from 'qrcode'
import { data, redirect, Form, useNavigation } from 'react-router'
import { z } from 'zod'
import { ErrorList, OTPField } from '#app/components/forms.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { isCodeValid } from '#app/routes/_auth/verify.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getDomainUrl, useIsPending } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { getTOTPAuthUri } from '#app/utils/totp.server.ts'
import { type BreadcrumbHandle } from '../../profile/_layout.tsx'
import { type Route } from './+types/verify.ts'
import { twoFAVerificationType } from './_layout.tsx'

export const handle: BreadcrumbHandle & SEOHandle = {
	breadcrumb: <Icon name="check">Verify</Icon>,
	getSitemapEntries: () => null,
}

const CancelSchema = z.object({ intent: z.literal('cancel') })
const VerifySchema = z.object({
	intent: z.literal('verify'),
	code: z.string().min(6).max(6),
})

const ActionSchema = z.discriminatedUnion('intent', [
	CancelSchema,
	VerifySchema,
])

export const twoFAVerifyVerificationType = '2fa-verify'

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const verification = await prisma.verification.findUnique({
		where: {
			target_type: { type: twoFAVerifyVerificationType, target: userId },
		},
		select: {
			id: true,
			algorithm: true,
			secret: true,
			period: true,
			digits: true,
		},
	})
	if (!verification) {
		return redirect('/settings/profile/two-factor')
	}
	const user = await prisma.user.findUniqueOrThrow({
		where: { id: userId },
		select: { email: true },
	})
	const issuer = new URL(getDomainUrl(request)).host
	const otpUri = getTOTPAuthUri({
		...verification,
		accountName: user.email,
		issuer,
	})
	const qrCode = await QRCode.toDataURL(otpUri)
	return { otpUri, qrCode }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()

	const submission = await parseWithZod(formData, {
		schema: () =>
			ActionSchema.superRefine(async (data, ctx) => {
				if (data.intent === 'cancel') return null
				const codeIsValid = await isCodeValid({
					code: data.code,
					type: twoFAVerifyVerificationType,
					target: userId,
				})
				if (!codeIsValid) {
					ctx.addIssue({
						path: ['code'],
						code: z.ZodIssueCode.custom,
						message: `Invalid code`,
					})
					return z.NEVER
				}
			}),
		async: true,
	})

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	switch (submission.value.intent) {
		case 'cancel': {
			await prisma.verification.deleteMany({
				where: { type: twoFAVerifyVerificationType, target: userId },
			})
			return redirect('/settings/profile/two-factor')
		}
		case 'verify': {
			await prisma.verification.update({
				where: {
					target_type: { type: twoFAVerifyVerificationType, target: userId },
				},
				data: { type: twoFAVerificationType },
			})
			return redirectWithToast('/settings/profile/two-factor', {
				type: 'success',
				title: 'Enabled',
				description: 'Two-factor authentication has been enabled.',
			})
		}
	}
}

export default function TwoFactorRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const navigation = useNavigation()

	const isPending = useIsPending()
	const pendingIntent = isPending ? navigation.formData?.get('intent') : null

	const [form, fields] = useForm({
		id: 'verify-form',
		constraint: getZodConstraint(ActionSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ActionSchema })
		},
	})
	const lastSubmissionIntent = fields.intent.value

	return (
		<section className="max-w-2xl">
			<div className="flex flex-col items-center gap-4 text-center">
				<h2 className="text-body-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
					Verify two-factor authentication
				</h2>
				<p className="text-body-2xs text-muted-foreground">
					Scan the QR code to add this account to your authenticator app.
				</p>
				<img alt="qr code" src={loaderData.qrCode} className="size-56" />
				<p className="text-body-2xs text-muted-foreground">
					If you cannot scan the QR code, you can manually add this account with
					this code:
				</p>
				<div className="rounded-lg border border-border/60 bg-muted/30 p-3">
					<pre
						className="text-xs break-all whitespace-pre-wrap text-muted-foreground"
						aria-label="One-time Password URI"
					>
						{loaderData.otpUri}
					</pre>
				</div>
				<p className="text-body-2xs text-muted-foreground">
					Once you've added the account, enter the code from your authenticator
					app below.
				</p>
				<div className="flex w-full max-w-xs flex-col justify-center gap-4">
					<Form method="POST" {...getFormProps(form)} className="flex-1">
						<div className="flex items-center justify-center">
							<OTPField
								labelProps={{
									htmlFor: fields.code.id,
									children: 'Code',
								}}
								inputProps={{
									...getInputProps(fields.code, { type: 'text' }),
									autoFocus: true,
									autoComplete: 'one-time-code',
								}}
								errors={fields.code.errors}
							/>
						</div>

						<div className="min-h-[32px] px-4 pt-1 pb-3">
							<ErrorList id={form.errorId} errors={form.errors} />
						</div>

						<div className="flex justify-between gap-4">
							<StatusButton
								className="w-full"
								status={
									pendingIntent === 'verify'
										? 'pending'
										: lastSubmissionIntent === 'verify'
											? (form.status ?? 'idle')
											: 'idle'
								}
								type="submit"
								name="intent"
								value="verify"
							>
								Submit
							</StatusButton>
							<StatusButton
								className="w-full"
								variant="secondary"
								status={
									pendingIntent === 'cancel'
										? 'pending'
										: lastSubmissionIntent === 'cancel'
											? (form.status ?? 'idle')
											: 'idle'
								}
								type="submit"
								name="intent"
								value="cancel"
								disabled={isPending}
							>
								Cancel
							</StatusButton>
						</div>
					</Form>
				</div>
			</div>
		</section>
	)
}
