import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Form, useSearchParams } from 'react-router'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList, OTPField } from '#app/components/forms.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { checkHoneypot } from '#app/utils/honeypot.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { type Route } from './+types/verify.ts'
import { validateRequest } from './verify.server.ts'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export const codeQueryParam = 'code'
export const targetQueryParam = 'target'
export const typeQueryParam = 'type'
export const redirectToQueryParam = 'redirectTo'
const types = ['onboarding', 'reset-password', 'change-email', '2fa'] as const
const VerificationTypeSchema = z.enum(types)
export type VerificationTypes = z.infer<typeof VerificationTypeSchema>

export const VerifySchema = z.object({
	[codeQueryParam]: z.string().min(6).max(6),
	[typeQueryParam]: VerificationTypeSchema,
	[targetQueryParam]: z.string(),
	[redirectToQueryParam]: z.string().optional(),
})

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData()
	await checkHoneypot(formData)
	return validateRequest(request, formData)
}

export default function VerifyRoute({ actionData }: Route.ComponentProps) {
	const [searchParams] = useSearchParams()
	const isPending = useIsPending()
	const parseWithZoddType = VerificationTypeSchema.safeParse(
		searchParams.get(typeQueryParam),
	)
	const type = parseWithZoddType.success ? parseWithZoddType.data : null

	const headingCopy: Record<
		VerificationTypes,
		{ title: string; description: string }
	> = {
		onboarding: {
			title: 'Check your email',
			description: "We've sent a code to verify your email address.",
		},
		'reset-password': {
			title: 'Check your email',
			description: "We've sent a code to reset your password.",
		},
		'change-email': {
			title: 'Check your email',
			description: "We've sent a code to confirm the new address.",
		},
		'2fa': {
			title: 'Check your 2FA app',
			description: 'Enter the code from your authenticator app.',
		},
	}
	const heading = type ? headingCopy[type] : null

	const [form, fields] = useForm({
		id: 'verify-form',
		constraint: getZodConstraint(VerifySchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: VerifySchema })
		},
		defaultValue: {
			code: searchParams.get(codeQueryParam),
			type: type,
			target: searchParams.get(targetQueryParam),
			redirectTo: searchParams.get(redirectToQueryParam),
		},
	})

	return (
		<main className="mx-auto flex max-w-(--reading-column) flex-col gap-8 px-6 py-10 md:px-8">
			<header className="mb-2 text-center md:text-left">
				<p className="text-body-2xs text-muted-foreground/70 uppercase tracking-[0.2em]">
					Verification
				</p>
				<h1 className="text-h4 font-serif tracking-tight">
					{heading?.title ?? 'Invalid verification type'}
				</h1>
				{heading?.description ? (
					<p className="text-body-2xs text-muted-foreground mt-1">
						{heading.description}
					</p>
				) : null}
			</header>

			<section className="max-w-sm border-y border-border/40 py-6">
				<ErrorList errors={form.errors} id={form.errorId} />
				<Form method="POST" {...getFormProps(form)} className="grid gap-4">
					<HoneypotInputs />
					<div className="flex items-center justify-center">
						<OTPField
							labelProps={{
								htmlFor: fields[codeQueryParam].id,
								children: 'Code',
							}}
							inputProps={{
								...getInputProps(fields[codeQueryParam], { type: 'text' }),
								autoComplete: 'one-time-code',
								autoFocus: true,
							}}
							errors={fields[codeQueryParam].errors}
						/>
					</div>
					<input {...getInputProps(fields[typeQueryParam], { type: 'hidden' })} />
					<input
						{...getInputProps(fields[targetQueryParam], { type: 'hidden' })}
					/>
					<input
						{...getInputProps(fields[redirectToQueryParam], {
							type: 'hidden',
						})}
					/>
					<StatusButton
						className="w-full"
						status={isPending ? 'pending' : (form.status ?? 'idle')}
						type="submit"
						disabled={isPending}
					>
						Submit
					</StatusButton>
				</Form>
			</section>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
