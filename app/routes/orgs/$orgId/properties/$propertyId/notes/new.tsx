import { getFormProps, getInputProps, getTextareaProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { data, Form, Link } from 'react-router'
import { z } from 'zod'
import { ErrorList, Field, TextareaField } from '#app/components/forms.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { writeAuditLog } from '#app/utils/audit.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	assertMembershipPermission,
	requireMembership,
} from '#app/utils/membership.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/new.ts'

const CreateEntityNoteSchema = z.object({
	body: z.string({ required_error: 'Note content is required' }).min(1),
	tags: z
		.string()
		.optional()
		.transform((value) =>
			value
				? value
						.split(',')
						.map((tag) => tag.trim())
						.filter(Boolean)
						: [],
		),
	isDecisionNote: z
		.preprocess((value) => value === 'on', z.boolean())
		.optional(),
})

export async function loader({ params, request }: Route.LoaderArgs) {
	const { orgId: organizationId, propertyId } = params
	if (!organizationId || !propertyId) {
		throw new Response('Not found', { status: 404 })
	}

	const membership = await requireMembership(request, organizationId)
	assertMembershipPermission(membership, 'create:entity-note:any')

	const property = await prisma.property.findFirst({
		where: { id: propertyId, organizationId },
		select: { id: true, name: true },
	})
	if (!property) throw new Response('Property not found', { status: 404 })

	return { property, organizationId }
}

export async function action({ params, request }: Route.ActionArgs) {
	const { orgId: organizationId, propertyId } = params
	if (!organizationId || !propertyId) {
		throw new Response('Not found', { status: 404 })
	}

	const membership = await requireMembership(request, organizationId)
	assertMembershipPermission(membership, 'create:entity-note:any')

	const property = await prisma.property.findFirst({
		where: { id: propertyId, organizationId },
		select: { id: true },
	})
	if (!property) throw new Response('Property not found', { status: 404 })

	const formData = await request.formData()
	const submission = await parseWithZod(formData, {
		schema: CreateEntityNoteSchema,
	})

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	await prisma.$transaction(async (tx) => {
		const note = await tx.entityNote.create({
			data: {
				entityType: 'property',
				entityId: propertyId,
				body: submission.value.body,
				tags: submission.value.tags,
				isDecisionNote: submission.value.isDecisionNote ?? false,
				organizationId,
				createdByType: 'USER',
				createdById: membership.userId,
			},
			select: {
				id: true,
				body: true,
				entityType: true,
				entityId: true,
			},
		})

		await writeAuditLog(
			{
				action: 'CREATE',
				entityType: 'entity-note',
				entityId: note.id,
				organizationId,
				actorId: membership.userId,
				before: null,
				after: note,
			},
			tx,
		)
		await tx.timelineEvent.create({
			data: {
				type: 'NOTE_ADDED',
				message: 'Note added',
				propertyId,
				organizationId,
				entityNoteId: note.id,
				actorId: membership.userId,
				actorType: 'USER',
			},
			select: { id: true },
		})

		return note
	})

	return redirectWithToast(
		`/orgs/${organizationId}/properties/${propertyId}`,
		{
			title: 'Note added',
			description: 'The note is now in the property timeline.',
			type: 'success',
		},
	)
}

export default function NewPropertyNote({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const isPending = useIsPending()
	const [form, fields] = useForm({
		id: 'create-note',
		constraint: getZodConstraint(CreateEntityNoteSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: CreateEntityNoteSchema })
		},
		shouldRevalidate: 'onBlur',
	})
	const propertyUrl = `/orgs/${loaderData.organizationId}/properties/${loaderData.property.id}`

	return (
		<div className="mx-auto max-w-(--reading-column) px-5 py-8 md:px-8">
			<Link
				to={propertyUrl}
				className="text-body-xs text-muted-foreground hover:text-foreground"
			>
				← Back to {loaderData.property.name}
			</Link>
			<h1 className="text-h3 mt-4">Add Note</h1>

			<Form
				method="POST"
				{...getFormProps(form)}
				className="mt-6 grid max-w-lg gap-4"
			>
				<TextareaField
					labelProps={{ children: 'Content (markdown)' }}
					textareaProps={{
						...getTextareaProps(fields.body),
						placeholder: 'Write your note. Markdown is supported.',
						rows: 6,
					}}
					errors={fields.body.errors}
				/>
				<Field
					labelProps={{ children: 'Tags (comma-separated)' }}
					inputProps={getInputProps(fields.tags, {
						type: 'text',
						placeholder: 'e.g. inspection, plumbing',
					})}
					errors={fields.tags.errors}
				/>
				<div className="flex items-center gap-2">
					<input
						id={fields.isDecisionNote.id}
						name={fields.isDecisionNote.name}
						type="checkbox"
						className="h-4 w-4"
					/>
					<label
						htmlFor={fields.isDecisionNote.id}
						className="text-body-xs text-muted-foreground"
					>
						Mark as decision note
					</label>
				</div>
				<ErrorList errors={form.errors} id={form.errorId} />
				<StatusButton
					type="submit"
					status={isPending ? 'pending' : (form.status ?? 'idle')}
					disabled={isPending}
				>
					Add note
				</StatusButton>
			</Form>
		</div>
	)
}
