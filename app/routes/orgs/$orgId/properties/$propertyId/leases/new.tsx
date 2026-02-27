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

const CreateLeaseSchema = z.object({
	tenantName: z.string({ required_error: 'Tenant name is required' }).min(1),
	leaseStartDate: z.string({ required_error: 'Start date is required' }).min(1),
	leaseEndDate: z.string().optional(),
	monthlyRent: z.preprocess(
		(value) =>
			typeof value === 'string' && value.length > 0 ? Number(value) : null,
		z.number().min(0).nullable(),
	),
	securityDeposit: z.preprocess(
		(value) =>
			typeof value === 'string' && value.length > 0 ? Number(value) : null,
		z.number().min(0).nullable(),
	),
	paymentDueDay: z.preprocess(
		(value) =>
			typeof value === 'string' && value.length > 0 ? Number(value) : null,
		z.number().int().min(1).max(31).nullable(),
	),
})

export async function loader({ params, request }: Route.LoaderArgs) {
	const { orgId: organizationId, propertyId } = params
	if (!organizationId || !propertyId) {
		throw new Response('Not found', { status: 404 })
	}

	const membership = await requireMembership(request, organizationId)
	assertMembershipPermission(membership, 'create:lease:any')

	const property = await prisma.property.findFirst({
		where: { id: propertyId, organizationId },
		select: {
			id: true,
			name: true,
			organization: { select: { id: true, name: true } },
		},
	})
	if (!property) throw new Response('Property not found', { status: 404 })

	return {
		property,
		organizationId,
	}
}

export async function action({ params, request }: Route.ActionArgs) {
	const { orgId: organizationId, propertyId } = params
	if (!organizationId || !propertyId) {
		throw new Response('Not found', { status: 404 })
	}

	const membership = await requireMembership(request, organizationId)
	assertMembershipPermission(membership, 'create:lease:any')

	const property = await prisma.property.findFirst({
		where: { id: propertyId, organizationId },
		select: { id: true, name: true },
	})
	if (!property) throw new Response('Property not found', { status: 404 })

	const formData = await request.formData()
	const submission = await parseWithZod(formData, { schema: CreateLeaseSchema })
	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const leaseStartDate = new Date(submission.value.leaseStartDate)
	const leaseEndDate = submission.value.leaseEndDate
		? new Date(submission.value.leaseEndDate)
		: null

	const lease = await prisma.$transaction(async (tx) => {
		const lease = await tx.lease.create({
			data: {
				propertyId,
				tenantName: submission.value.tenantName,
				leaseStartDate,
				leaseEndDate,
				monthlyRent: submission.value.monthlyRent ?? 0,
				securityDeposit: submission.value.securityDeposit ?? 0,
				paymentDueDay: submission.value.paymentDueDay ?? 1,
			},
			select: {
				id: true,
				tenantName: true,
				leaseStartDate: true,
				leaseEndDate: true,
				monthlyRent: true,
				securityDeposit: true,
				paymentDueDay: true,
			},
		})

		await writeAuditLog(
			{
				action: 'CREATE',
				entityType: 'lease',
				entityId: lease.id,
				organizationId,
				actorId: membership.userId,
				before: null,
				after: lease,
			},
			tx,
		)
		await tx.timelineEvent.create({
			data: {
				type: 'LEASE_CREATED',
				message: 'Lease created',
				propertyId,
				organizationId,
				leaseId: lease.id,
				actorId: membership.userId,
				actorType: 'USER',
			},
			select: { id: true },
		})

		return lease
	})

	return redirectWithToast(
		`/orgs/${organizationId}/properties/${propertyId}`,
		{
			title: 'Lease created',
			description: `${lease.tenantName} added to the property.`,
			type: 'success',
		},
	)
}

export default function NewLease({ loaderData, actionData }: Route.ComponentProps) {
	const isPending = useIsPending()
	const [form, fields] = useForm({
		id: 'create-lease',
		constraint: getZodConstraint(CreateLeaseSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: CreateLeaseSchema })
		},
		shouldRevalidate: 'onBlur',
	})
	const propertyUrl = `/orgs/${loaderData.organizationId}/properties/${loaderData.property.id}`

	return (
		<div className="mx-auto flex max-w-(--reading-column) flex-col gap-8 px-6 py-10 md:px-8">
			<header className="mb-2">
				<Link
					to={propertyUrl}
					className="text-body-2xs text-muted-foreground hover:text-foreground"
				>
					← Back to {loaderData.property.name}
				</Link>
				<p className="text-body-2xs text-muted-foreground/70 mt-6 uppercase tracking-[0.2em]">
					Lease
				</p>
				<h1 className="text-h4 font-serif tracking-tight">Create lease</h1>
				<p className="text-body-2xs text-muted-foreground mt-1">
					Capture the lease basics for timeline reasoning.
				</p>
			</header>

			<Form
				method="POST"
				{...getFormProps(form)}
				className="grid max-w-lg gap-6"
			>
				<Field
					labelProps={{ children: 'Tenant name' }}
					inputProps={{
						...getInputProps(fields.tenantName, { type: 'text' }),
						placeholder: 'e.g. Alex Rivera',
					}}
					errors={fields.tenantName.errors}
				/>
				<div className="grid gap-4 md:grid-cols-2">
					<Field
						labelProps={{ children: 'Start date' }}
						inputProps={getInputProps(fields.leaseStartDate, { type: 'date' })}
						errors={fields.leaseStartDate.errors}
					/>
					<Field
						labelProps={{ children: 'End date (optional)' }}
						inputProps={getInputProps(fields.leaseEndDate, { type: 'date' })}
						errors={fields.leaseEndDate.errors}
					/>
				</div>
				<div className="grid gap-4 md:grid-cols-2">
					<Field
						labelProps={{ children: 'Monthly rent' }}
						inputProps={getInputProps(fields.monthlyRent, {
							type: 'number',
							step: '0.01',
						})}
						errors={fields.monthlyRent.errors}
					/>
					<Field
						labelProps={{ children: 'Security deposit' }}
						inputProps={getInputProps(fields.securityDeposit, {
							type: 'number',
							step: '0.01',
						})}
						errors={fields.securityDeposit.errors}
					/>
				</div>
				<Field
					labelProps={{ children: 'Payment due day' }}
					inputProps={getInputProps(fields.paymentDueDay, {
						type: 'number',
						min: 1,
						max: 31,
					})}
					errors={fields.paymentDueDay.errors}
				/>

				<ErrorList errors={form.errors} id={form.errorId} />
				<StatusButton
					type="submit"
					status={isPending ? 'pending' : (form.status ?? 'idle')}
					disabled={isPending}
				>
					Create lease
				</StatusButton>
			</Form>
		</div>
	)
}
