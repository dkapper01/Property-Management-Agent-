import {
	getFormProps,
	getInputProps,
	getTextareaProps,
	useForm,
} from '@conform-to/react'
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

const OptionalStringSchema = z
	.string()
	.optional()
	.transform((value) => (value && value.length > 0 ? value : null))

const OptionalEmailSchema = z.preprocess(
	(value) => (typeof value === 'string' && value.length > 0 ? value : undefined),
	z.string().email('Enter a valid email').optional(),
).transform((value) => value ?? null)

const VendorSchema = z.object({
	name: z.string({ required_error: 'Vendor name is required' }).min(1),
	category: OptionalStringSchema,
	phone: OptionalStringSchema,
	email: OptionalEmailSchema,
	website: OptionalStringSchema,
	notes: OptionalStringSchema,
})

export async function loader({ params, request }: Route.LoaderArgs) {
	const organizationId = params.orgId
	if (!organizationId) {
		throw new Response('Workspace not found', { status: 404 })
	}

	const membership = await requireMembership(request, organizationId)
	assertMembershipPermission(membership, 'create:vendor:any')

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
	assertMembershipPermission(membership, 'create:vendor:any')

	const formData = await request.formData()
	const submission = await parseWithZod(formData, {
		schema: VendorSchema,
	})

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const vendor = await prisma.$transaction(async (tx) => {
		const vendor = await tx.vendor.create({
			data: { ...submission.value, organizationId },
			select: {
				id: true,
				name: true,
				category: true,
				phone: true,
				email: true,
				website: true,
				notes: true,
				organizationId: true,
			},
		})

		await writeAuditLog(
			{
				action: 'CREATE',
				entityType: 'vendor',
				entityId: vendor.id,
				organizationId,
				actorId: membership.userId,
				before: null,
				after: vendor,
			},
			tx,
		)

		return vendor
	})

	return redirectWithToast(`/orgs/${organizationId}/vendors`, {
		title: 'Vendor added',
		description: `${vendor.name} is ready to assign.`,
		type: 'success',
	})
}

export default function NewVendor({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const isPending = useIsPending()
	const [form, fields] = useForm({
		id: 'create-vendor',
		constraint: getZodConstraint(VendorSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: VendorSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="mx-auto max-w-(--reading-column) px-6 py-10 md:px-8">
			<Link
				to={`/orgs/${loaderData.organization.id}/vendors`}
				className="text-body-2xs text-muted-foreground hover:text-foreground"
			>
				← Back to vendors
			</Link>
			<p className="text-body-2xs text-muted-foreground/70 mt-6 uppercase tracking-[0.2em]">
				Vendor
			</p>
			<h1 className="mt-2 text-h4 font-serif tracking-tight">Add vendor</h1>

			<Form
				method="POST"
				{...getFormProps(form)}
				className="mt-6 grid max-w-xl gap-6"
			>
				<Field
					labelProps={{ children: 'Vendor name' }}
					inputProps={{
						...getInputProps(fields.name, { type: 'text' }),
						placeholder: 'e.g. Atlas Plumbing',
					}}
					errors={fields.name.errors}
				/>
				<div className="grid gap-4 md:grid-cols-2">
					<Field
						labelProps={{ children: 'Category (optional)' }}
						inputProps={{
							...getInputProps(fields.category, { type: 'text' }),
							placeholder: 'Plumbing, HVAC, Electrical',
						}}
						errors={fields.category.errors}
					/>
					<Field
						labelProps={{ children: 'Phone (optional)' }}
						inputProps={{
							...getInputProps(fields.phone, { type: 'tel' }),
							placeholder: '+1 555 000 1234',
						}}
						errors={fields.phone.errors}
					/>
				</div>
				<div className="grid gap-4 md:grid-cols-2">
					<Field
						labelProps={{ children: 'Email (optional)' }}
						inputProps={{
							...getInputProps(fields.email, { type: 'email' }),
							placeholder: 'vendor@example.com',
						}}
						errors={fields.email.errors}
					/>
					<Field
						labelProps={{ children: 'Website (optional)' }}
						inputProps={{
							...getInputProps(fields.website, { type: 'url' }),
							placeholder: 'https://',
						}}
						errors={fields.website.errors}
					/>
				</div>
				<TextareaField
					labelProps={{ children: 'Notes (optional)' }}
					textareaProps={{
						...getTextareaProps(fields.notes),
						rows: 3,
						placeholder: 'Preferred contact, specialties, pricing, etc.',
					}}
					errors={fields.notes.errors}
				/>
				<ErrorList errors={form.errors} id={form.errorId} />
				<StatusButton
					type="submit"
					status={isPending ? 'pending' : (form.status ?? 'idle')}
					disabled={isPending}
				>
					Add vendor
				</StatusButton>
			</Form>
		</div>
	)
}
