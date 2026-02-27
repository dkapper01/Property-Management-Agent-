import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { data, redirect, Form } from 'react-router'
import { z } from 'zod'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	prepareVerification,
	requireRecentVerification,
} from '#app/routes/_auth/verify.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { sendEmail } from '#app/utils/email.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { EmailSchema } from '#app/utils/user-validation.ts'
import { verifySessionStorage } from '#app/utils/verification.server.ts'
import { type Route } from './+types/change-email.ts'
import { type BreadcrumbHandle } from './_layout.tsx'
import { EmailChangeEmail } from './change-email.server.tsx'

export const handle: BreadcrumbHandle & SEOHandle = {
	breadcrumb: <Icon name="envelope-closed">Change Email</Icon>,
	getSitemapEntries: () => null,
}

export const newEmailAddressSessionKey = 'new-email-address'

const ChangeEmailSchema = z.object({
	email: EmailSchema,
})

export async function loader({ request }: Route.LoaderArgs) {
	await requireRecentVerification(request)
	const userId = await requireUserId(request)
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { email: true },
	})
	if (!user) {
		const params = new URLSearchParams({ redirectTo: request.url })
		throw redirect(`/login?${params}`)
	}
	return { user }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const submission = await parseWithZod(formData, {
		schema: ChangeEmailSchema.superRefine(async (data, ctx) => {
			const existingUser = await prisma.user.findUnique({
				where: { email: data.email },
			})
			if (existingUser) {
				ctx.addIssue({
					path: ['email'],
					code: z.ZodIssueCode.custom,
					message: 'This email is already in use.',
				})
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
	const { otp, redirectTo, verifyUrl } = await prepareVerification({
		period: 10 * 60,
		request,
		target: userId,
		type: 'change-email',
	})

	const response = await sendEmail({
		to: submission.value.email,
		subject: `Epic Notes Email Change Verification`,
		react: <EmailChangeEmail verifyUrl={verifyUrl.toString()} otp={otp} />,
	})

	if (response.status === 'success') {
		const verifySession = await verifySessionStorage.getSession()
		verifySession.set(newEmailAddressSessionKey, submission.value.email)
		return redirect(redirectTo.toString(), {
			headers: {
				'set-cookie': await verifySessionStorage.commitSession(verifySession),
			},
		})
	} else {
		return data(
			{ result: submission.reply({ formErrors: [response.error.message] }) },
			{ status: 500 },
		)
	}
}

export default function ChangeEmailIndex({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const [form, fields] = useForm({
		id: 'change-email-form',
		constraint: getZodConstraint(ChangeEmailSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ChangeEmailSchema })
		},
	})

	const isPending = useIsPending()
	return (
		<section className="max-w-md">
			<h2 className="text-body-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
				Change email
			</h2>
			<p className="mt-2 text-body-2xs text-muted-foreground">
				We’ll confirm your new email before updating your account.
			</p>
			<p className="text-body-2xs text-muted-foreground">
				A notice will also be sent to {loaderData.user.email}.
			</p>
			<Form method="POST" {...getFormProps(form)} className="mt-4 grid gap-4">
				<Field
					labelProps={{ children: 'New Email' }}
					inputProps={{
						...getInputProps(fields.email, { type: 'email' }),
						autoComplete: 'email',
					}}
					errors={fields.email.errors}
				/>
				<ErrorList id={form.errorId} errors={form.errors} />
				<StatusButton status={isPending ? 'pending' : (form.status ?? 'idle')}>
					Send Confirmation
				</StatusButton>
			</Form>
		</section>
	)
}
