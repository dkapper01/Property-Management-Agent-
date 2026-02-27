import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { data, Form, Link } from 'react-router'
import { z } from 'zod'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { writeAuditLog } from '#app/utils/audit.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/new.ts'

const OrganizationSchema = z.object({
	name: z.string({ required_error: 'Workspace name is required' }).min(1),
})

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserId(request)
	return {}
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const submission = await parseWithZod(formData, {
		schema: OrganizationSchema,
	})

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const ownerRole = await prisma.role.findUniqueOrThrow({
		where: { name: 'owner' },
		select: { id: true },
	})

	const organization = await prisma.$transaction(async (tx) => {
		const organization = await tx.organization.create({
			data: { name: submission.value.name },
			select: { id: true, name: true },
		})

		const membership = await tx.membership.create({
			data: {
				organizationId: organization.id,
				userId,
				roleId: ownerRole.id,
			},
			select: {
				id: true,
				organizationId: true,
				userId: true,
				roleId: true,
			},
		})

		await writeAuditLog(
			{
				action: 'CREATE',
				entityType: 'organization',
				entityId: organization.id,
				organizationId: organization.id,
				actorId: userId,
				before: null,
				after: organization,
			},
			tx,
		)

		await writeAuditLog(
			{
				action: 'CREATE',
				entityType: 'membership',
				entityId: membership.id,
				organizationId: organization.id,
				actorId: userId,
				before: null,
				after: membership,
			},
			tx,
		)

		return organization
	})

	return redirectWithToast(`/orgs/${organization.id}/properties`, {
		title: 'Workspace created',
		description: `${organization.name} is ready.`,
		type: 'success',
	})
}

export default function NewWorkspace({ actionData }: Route.ComponentProps) {
	const isPending = useIsPending()
	const [form, fields] = useForm({
		id: 'create-organization',
		constraint: getZodConstraint(OrganizationSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: OrganizationSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="mx-auto flex max-w-(--reading-column) flex-col gap-8 px-6 py-10 md:px-8">
			<header className="mb-2">
				<Link
					to="/orgs"
					className="text-body-2xs text-muted-foreground hover:text-foreground"
				>
					← Back to workspaces
				</Link>
				<p className="text-body-2xs text-muted-foreground/70 mt-6 uppercase tracking-[0.2em]">
					Workspace
				</p>
				<h1 className="text-h4 font-serif tracking-tight">Create workspace</h1>
				<p className="text-body-2xs text-muted-foreground mt-1">
					Start a new portfolio to organize properties, notes, and timelines.
				</p>
			</header>

			<Form
				method="POST"
				{...getFormProps(form)}
				className="grid max-w-md gap-4"
			>
				<Field
					labelProps={{ children: 'Workspace name' }}
					inputProps={{
						...getInputProps(fields.name, { type: 'text' }),
						placeholder: 'e.g. Sunset Property Group',
					}}
					errors={fields.name.errors}
				/>
				<ErrorList errors={form.errors} id={form.errorId} />
				<StatusButton
					type="submit"
					status={isPending ? 'pending' : (form.status ?? 'idle')}
					disabled={isPending}
				>
					Create workspace
				</StatusButton>
			</Form>
		</div>
	)
}
