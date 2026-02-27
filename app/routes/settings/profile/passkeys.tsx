import { startRegistration } from '@simplewebauthn/browser'
import { formatDistanceToNow } from 'date-fns'
import { useState } from 'react'
import { Form, useRevalidator } from 'react-router'
import { z } from 'zod'
import { Icon } from '#app/components/ui/icon.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { type Route } from './+types/passkeys.ts'

export const handle = {
	breadcrumb: <Icon name="passkey">Passkeys</Icon>,
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const passkeys = await prisma.passkey.findMany({
		where: { userId },
		orderBy: { createdAt: 'desc' },
		select: {
			id: true,
			deviceType: true,
			createdAt: true,
		},
	})
	return { passkeys }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'delete') {
		const passkeyId = formData.get('passkeyId')
		if (typeof passkeyId !== 'string') {
			return Response.json(
				{ status: 'error', error: 'Invalid passkey ID' },
				{ status: 400 },
			)
		}

		await prisma.passkey.delete({
			where: {
				id: passkeyId,
				userId, // Ensure the passkey belongs to the user
			},
		})
		return Response.json({ status: 'success' })
	}

	return Response.json(
		{ status: 'error', error: 'Invalid intent' },
		{ status: 400 },
	)
}

const RegistrationOptionsSchema = z.object({
	options: z.object({
		rp: z.object({
			id: z.string(),
			name: z.string(),
		}),
		user: z.object({
			id: z.string(),
			name: z.string(),
			displayName: z.string(),
		}),
		challenge: z.string(),
		pubKeyCredParams: z.array(
			z.object({
				type: z.literal('public-key'),
				alg: z.number(),
			}),
		),
		authenticatorSelection: z
			.object({
				authenticatorAttachment: z
					.enum(['platform', 'cross-platform'])
					.optional(),
				residentKey: z
					.enum(['required', 'preferred', 'discouraged'])
					.optional(),
				userVerification: z
					.enum(['required', 'preferred', 'discouraged'])
					.optional(),
				requireResidentKey: z.boolean().optional(),
			})
			.optional(),
	}),
}) satisfies z.ZodType<{ options: PublicKeyCredentialCreationOptionsJSON }>

export default function Passkeys({ loaderData }: Route.ComponentProps) {
	const revalidator = useRevalidator()
	const [error, setError] = useState<string | null>(null)

	async function handlePasskeyRegistration() {
		try {
			setError(null)
			const resp = await fetch('/webauthn/registration')
			const jsonResult = await resp.json()
			const parsedResult = RegistrationOptionsSchema.parse(jsonResult)

			const regResult = await startRegistration({
				optionsJSON: parsedResult.options,
			})

			const verificationResp = await fetch('/webauthn/registration', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(regResult),
			})

			if (!verificationResp.ok) {
				throw new Error('Failed to verify registration')
			}

			void revalidator.revalidate()
		} catch (err) {
			console.error('Failed to create passkey:', err)
			setError('Failed to create passkey. Please try again.')
		}
	}

	return (
		<div className="grid gap-6">
			<section className="border-y border-border/40 py-4">
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div>
						<h2 className="text-body-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
							Passkeys
						</h2>
						<p className="mt-2 text-body-2xs text-muted-foreground">
							Use passkeys for faster, safer sign-ins.
						</p>
					</div>
					<form action={handlePasskeyRegistration}>
						<button
							type="submit"
							className="text-body-2xs text-muted-foreground hover:text-foreground"
						>
							Register new passkey
						</button>
					</form>
				</div>

				{error ? (
					<div className="bg-destructive/15 text-destructive mt-4 rounded-lg p-3 text-body-xs">
						{error}
					</div>
				) : null}

				{loaderData.passkeys.length ? (
					<ul className="mt-4 divide-y divide-border/40" title="passkeys">
						{loaderData.passkeys.map((passkey) => (
							<li key={passkey.id} className="flex items-center justify-between gap-4 py-3">
								<div className="flex flex-col gap-2">
									<div className="flex items-center gap-2">
										<Icon name="lock-closed" />
										<span className="font-semibold">
											{passkey.deviceType === 'platform'
												? 'Device'
												: 'Security Key'}
										</span>
									</div>
									<div className="text-body-2xs text-muted-foreground">
										Registered{' '}
										{formatDistanceToNow(new Date(passkey.createdAt))} ago
									</div>
								</div>
								<Form method="POST">
									<input type="hidden" name="passkeyId" value={passkey.id} />
									<button
										type="submit"
										name="intent"
										value="delete"
										className="text-body-2xs text-muted-foreground hover:text-foreground"
									>
										Remove
									</button>
								</Form>
							</li>
						))}
					</ul>
				) : (
					<p className="text-body-sm text-muted-foreground mt-3">
						No passkeys registered yet.
					</p>
				)}
			</section>
		</div>
	)
}
