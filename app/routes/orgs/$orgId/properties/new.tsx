import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { data, Form, Link } from 'react-router'
import { z } from 'zod'
import { ErrorList, Field } from '#app/components/forms.tsx'
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

const PropertySchema = z.object({
	name: z.string({ required_error: 'Property name is required' }).min(1),
	address: z.string({ required_error: 'Address is required' }).min(1),
	country: z.string().optional(),
	purchaseDate: z.string().optional(),
	purchasePrice: z
		.string()
		.optional()
		.transform((value) => (value ? Number(value) : undefined)),
	ownershipType: z.enum(['INDIVIDUAL', 'LLC', 'PARTNERSHIP']).default('INDIVIDUAL'),
	status: z
		.enum(['OWNER_OCCUPIED', 'RENTED', 'VACANT', 'RENOVATING'])
		.default('OWNER_OCCUPIED'),
	notes: z.string().optional(),
})

export async function loader({ params, request }: Route.LoaderArgs) {
	const organizationId = params.orgId
	if (!organizationId) {
		throw new Response('Workspace not found', { status: 404 })
	}

	const membership = await requireMembership(request, organizationId)
	assertMembershipPermission(membership, 'create:property:any')

	const organization = await prisma.organization.findUnique({
		where: { id: organizationId },
		select: { id: true, name: true },
	})
	if (!organization) {
		throw new Response('Workspace not found', { status: 404 })
	}

	return { organization }
}

export async function action({ request, params }: Route.ActionArgs) {
	const organizationId = params.orgId
	if (!organizationId) {
		throw new Response('Workspace not found', { status: 404 })
	}

	const membership = await requireMembership(request, organizationId)
	assertMembershipPermission(membership, 'create:property:any')

	const formData = await request.formData()
	const submission = await parseWithZod(formData, {
		schema: PropertySchema,
	})

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const purchaseDate = submission.value.purchaseDate
		? new Date(submission.value.purchaseDate)
		: undefined
	const purchasePrice =
		typeof submission.value.purchasePrice === 'number'
			? submission.value.purchasePrice
			: undefined

	const property = await prisma.$transaction(async (tx) => {
		const property = await tx.property.create({
			data: {
				name: submission.value.name,
				address: submission.value.address,
				country: submission.value.country,
				purchaseDate,
				purchasePrice: purchasePrice ?? 0,
				ownershipType: submission.value.ownershipType,
				status: submission.value.status,
				notes: submission.value.notes,
				organizationId,
			},
			select: {
				id: true,
				name: true,
				organizationId: true,
				address: true,
				country: true,
			},
		})

		await writeAuditLog(
			{
				action: 'CREATE',
				entityType: 'property',
				entityId: property.id,
				organizationId,
				actorId: membership.userId,
				before: null,
				after: property,
			},
			tx,
		)
		await tx.timelineEvent.create({
			data: {
				type: 'PROPERTY_UPDATED',
				message: 'Property created',
				propertyId: property.id,
				organizationId,
				actorId: membership.userId,
				actorType: 'USER',
			},
			select: { id: true },
		})

		return property
	})

	return redirectWithToast(
		`/orgs/${organizationId}/properties/${property.id}`,
		{
			title: 'Property created',
			description: `${property.name} is ready.`,
			type: 'success',
		},
	)
}

export default function NewProperty({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const isPending = useIsPending()
	const [form, fields] = useForm({
		id: 'create-property',
		constraint: getZodConstraint(PropertySchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: PropertySchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="mx-auto max-w-(--reading-column) px-6 py-10 md:px-8">
			<Link
				to={`/orgs/${loaderData.organization.id}/properties`}
				className="text-body-2xs text-muted-foreground hover:text-foreground"
			>
				← Back to portfolio
			</Link>
			<p className="text-body-2xs text-muted-foreground/70 mt-6 uppercase tracking-[0.2em]">
				Property
			</p>
			<h1 className="text-h4 font-serif tracking-tight mt-2">Add property</h1>

			<Form
				method="POST"
				{...getFormProps(form)}
				className="mt-6 grid max-w-lg gap-6"
			>
				<div className="grid gap-4">
					<Field
						labelProps={{ children: 'Property name' }}
						inputProps={{
							...getInputProps(fields.name, { type: 'text' }),
							placeholder: 'e.g. Sunset Villas',
						}}
						errors={fields.name.errors}
					/>
					<Field
						labelProps={{ children: 'Address' }}
						inputProps={{
							...getInputProps(fields.address, { type: 'text' }),
							placeholder: 'Street, city, country',
						}}
						errors={fields.address.errors}
					/>
					<Field
						labelProps={{ children: 'Country (optional)' }}
						inputProps={getInputProps(fields.country, {
							type: 'text',
							placeholder: 'e.g. US, TR',
						})}
						errors={fields.country.errors}
					/>
				</div>

				<div className="grid gap-4">
					<p className="text-body-sm font-semibold">Ownership</p>
					<div className="grid gap-4 md:grid-cols-2">
						<div className="grid gap-1">
							<label
								htmlFor={fields.ownershipType.id}
								className="text-body-xs text-muted-foreground"
							>
								Ownership type
							</label>
							<select
								id={fields.ownershipType.id}
								name={fields.ownershipType.name}
								defaultValue="INDIVIDUAL"
								className="border-border/60 bg-background w-full rounded-md border px-3 py-2 text-sm"
							>
								<option value="INDIVIDUAL">Individual</option>
								<option value="LLC">LLC</option>
								<option value="PARTNERSHIP">Partnership</option>
							</select>
						</div>
						<div className="grid gap-1">
							<label
								htmlFor={fields.status.id}
								className="text-body-xs text-muted-foreground"
							>
								Status
							</label>
							<select
								id={fields.status.id}
								name={fields.status.name}
								defaultValue="OWNER_OCCUPIED"
								className="border-border/60 bg-background w-full rounded-md border px-3 py-2 text-sm"
							>
								<option value="OWNER_OCCUPIED">Owner occupied</option>
								<option value="RENTED">Rented</option>
								<option value="VACANT">Vacant</option>
								<option value="RENOVATING">Renovating</option>
							</select>
						</div>
					</div>
					<div className="grid gap-4 md:grid-cols-2">
						<Field
							labelProps={{ children: 'Purchase date' }}
							inputProps={getInputProps(fields.purchaseDate, {
								type: 'date',
							})}
							errors={fields.purchaseDate.errors}
						/>
						<Field
							labelProps={{ children: 'Purchase price' }}
							inputProps={getInputProps(fields.purchasePrice, {
								type: 'number',
								step: '0.01',
							})}
							errors={fields.purchasePrice.errors}
						/>
					</div>
				</div>

				<div className="grid gap-4">
					<p className="text-body-sm font-semibold">Notes</p>
					<textarea
						name={fields.notes.name}
						id={fields.notes.id}
						rows={4}
						className="border-border/60 bg-background w-full rounded-md border px-3 py-2 text-sm"
						placeholder="Optional markdown notes for this property"
					/>
				</div>

				<ErrorList errors={form.errors} id={form.errorId} />
				<StatusButton
					type="submit"
					status={isPending ? 'pending' : (form.status ?? 'idle')}
					disabled={isPending}
				>
					Create property
				</StatusButton>
			</Form>
		</div>
	)
}
