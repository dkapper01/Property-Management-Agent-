import {
	getFormProps,
	getInputProps,
	getTextareaProps,
	useForm,
} from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { parseFormData } from '@mjackson/form-data-parser'
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
import { uploadMaintenanceImage } from '#app/utils/storage.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { roleHasPermission } from '#app/utils/user.ts'
import { type Route } from './+types/new.ts'

const MAX_UPLOAD_SIZE = 1024 * 1024 * 5
const MAX_UPLOAD_COUNT = 6

const MaintenanceSeverity = {
	LOW: 'LOW',
	MEDIUM: 'MEDIUM',
	HIGH: 'HIGH',
	CRITICAL: 'CRITICAL',
} as const

const MaintenanceStatus = {
	OPEN: 'OPEN',
	RESOLVED: 'RESOLVED',
} as const

const MaintenanceSeverityLabel: Record<string, string> = {
	LOW: 'Low',
	MEDIUM: 'Medium',
	HIGH: 'High',
	CRITICAL: 'Critical',
}

const OptionalStringSchema = z
	.string()
	.optional()
	.transform((v) => (v && v.length > 0 ? v : null))

const MaintenanceImageSchema = z
	.instanceof(File)
	.refine((f) => f.size <= MAX_UPLOAD_SIZE, {
		message: 'Image must be 5MB or smaller',
	})
	.refine((f) => f.type.startsWith('image/'), {
		message: 'Only image files are supported',
	})

const MaintenanceImagesSchema = z.preprocess(
	(v) => {
		if (!Array.isArray(v)) return []
		return v.filter((f) => f instanceof File && f.size > 0 && f.name !== '')
	},
	z.array(MaintenanceImageSchema).max(MAX_UPLOAD_COUNT, {
		message: `Upload up to ${MAX_UPLOAD_COUNT} images`,
	}),
)

const CreateMaintenanceSchema = z.object({
	description: z.string({ required_error: 'Description is required' }).min(1),
	dateReported: z.preprocess(
		(v) => (typeof v === 'string' && v.length > 0 ? new Date(v) : null),
		z.date().nullable(),
	),
	severity: z.nativeEnum(MaintenanceSeverity).optional(),
	status: z.nativeEnum(MaintenanceStatus).optional(),
	cost: z.preprocess(
		(v) => (typeof v === 'string' && v.length > 0 ? Number(v) : null),
		z.number().min(0).nullable(),
	),
	assetId: OptionalStringSchema,
	vendorId: OptionalStringSchema,
	images: MaintenanceImagesSchema.optional(),
})

export async function loader({ params, request }: Route.LoaderArgs) {
	const { orgId: organizationId, propertyId } = params
	if (!organizationId || !propertyId) {
		throw new Response('Not found', { status: 404 })
	}

	const membership = await requireMembership(request, organizationId)
	assertMembershipPermission(membership, 'create:maintenance-event:any')

	const property = await prisma.property.findFirst({
		where: { id: propertyId, organizationId },
		select: {
			id: true,
			name: true,
			organization: { select: { id: true, name: true } },
		},
	})
	if (!property) throw new Response('Property not found', { status: 404 })

	const assets = await prisma.asset.findMany({
		where: { propertyId },
		select: { id: true, assetType: true },
		orderBy: { assetType: 'asc' },
	})

	const canReadVendors = roleHasPermission(membership.role, 'read:vendor:any')
	const vendors = canReadVendors
		? await prisma.vendor.findMany({
				where: { organizationId },
				select: { id: true, name: true },
				orderBy: { name: 'asc' },
			})
		: []

	return { property, assets, vendors, organizationId, canReadVendors }
}

export async function action({ params, request }: Route.ActionArgs) {
	const { orgId: organizationId, propertyId } = params
	if (!organizationId || !propertyId) {
		throw new Response('Not found', { status: 404 })
	}

	const membership = await requireMembership(request, organizationId)
	assertMembershipPermission(membership, 'create:maintenance-event:any')

	const property = await prisma.property.findFirst({
		where: { id: propertyId, organizationId },
		select: { id: true, name: true },
	})
	if (!property) throw new Response('Property not found', { status: 404 })

	const formData = await parseFormData(request, {
		maxFileSize: MAX_UPLOAD_SIZE,
	})
	const submission = await parseWithZod(formData, {
		schema: CreateMaintenanceSchema,
	})
	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const imageFiles = submission.value.images ?? []
	if (submission.value.assetId) {
		const asset = await prisma.asset.findFirst({
			where: { id: submission.value.assetId, propertyId },
			select: { id: true },
		})
		if (!asset) throw new Response('Asset not found', { status: 404 })
	}

	if (submission.value.vendorId) {
		const vendor = await prisma.vendor.findFirst({
			where: {
				id: submission.value.vendorId,
				organizationId,
			},
			select: { id: true },
		})
		if (!vendor) throw new Response('Vendor not found', { status: 404 })
	}

	const record = await prisma.$transaction(async (tx) => {
		const record = await tx.maintenanceEvent.create({
			data: {
				description: submission.value.description,
				severity: submission.value.severity ?? 'MEDIUM',
				status: submission.value.status ?? 'OPEN',
				dateReported: submission.value.dateReported ?? new Date(),
				cost: submission.value.cost ?? null,
				propertyId,
				assetId: submission.value.assetId,
				vendorId: submission.value.vendorId,
				imageKeys: [],
			},
			select: {
				id: true,
				description: true,
				severity: true,
				status: true,
				dateReported: true,
			},
		})

		await writeAuditLog(
			{
				action: 'CREATE',
				entityType: 'maintenance-event',
				entityId: record.id,
				organizationId,
				actorId: membership.userId,
				before: null,
				after: record,
			},
			tx,
		)
		await tx.timelineEvent.create({
			data: {
				type: 'MAINTENANCE_CREATED',
				message: 'Maintenance event logged',
				propertyId,
				organizationId,
				maintenanceEventId: record.id,
				actorId: membership.userId,
				actorType: 'USER',
			},
			select: { id: true },
		})

		return record
	})

	if (imageFiles.length) {
		const imageKeys: string[] = []
		for (const file of imageFiles) {
			const objectKey = await uploadMaintenanceImage({
				organizationId,
				requestId: record.id,
				file,
			})
			imageKeys.push(objectKey)
		}

		await prisma.maintenanceEvent.update({
			where: { id: record.id },
			data: { imageKeys },
		})
	}

	return redirectWithToast(
		`/orgs/${organizationId}/properties/${propertyId}`,
		{
			title: 'Maintenance event logged',
			description: 'The event is now in the timeline.',
			type: 'success',
		},
	)
}

export default function NewMaintenance({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const isPending = useIsPending()
	const [form, fields] = useForm({
		id: 'create-maintenance',
		constraint: getZodConstraint(CreateMaintenanceSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: CreateMaintenanceSchema })
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
					Maintenance
				</p>
				<h1 className="text-h4 font-serif tracking-tight">
					Log maintenance event
				</h1>
				<p className="text-body-2xs text-muted-foreground mt-1">
					Capture an asset lifecycle event with a short description.
				</p>
			</header>

			<Form
				method="POST"
				encType="multipart/form-data"
				{...getFormProps(form)}
				className="grid max-w-lg gap-4"
			>
				<TextareaField
					labelProps={{ children: 'Description' }}
					textareaProps={{
						...getTextareaProps(fields.description),
						placeholder: 'Describe what happened',
						rows: 4,
					}}
					errors={fields.description.errors}
				/>
				<div className="grid gap-4 md:grid-cols-2">
					<Field
						labelProps={{ children: 'Date reported' }}
						inputProps={getInputProps(fields.dateReported, {
							type: 'date',
						})}
						errors={fields.dateReported.errors}
					/>
					<div className="grid gap-1">
						<label
							htmlFor={fields.severity.id}
							className="text-body-xs text-muted-foreground"
						>
							Severity
						</label>
						<select
							id={fields.severity.id}
							name={fields.severity.name}
							defaultValue="MEDIUM"
							className="border-border/60 bg-background w-full rounded-md border px-3 py-2 text-sm"
						>
							{Object.entries(MaintenanceSeverityLabel).map(
								([value, label]) => (
									<option key={value} value={value}>
										{label}
									</option>
								),
							)}
						</select>
					</div>
				</div>
				<div className="grid gap-4 md:grid-cols-2">
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
							defaultValue="OPEN"
							className="border-border/60 bg-background w-full rounded-md border px-3 py-2 text-sm"
						>
							<option value="OPEN">Open</option>
							<option value="RESOLVED">Resolved</option>
						</select>
					</div>
					<Field
						labelProps={{ children: 'Cost (optional)' }}
						inputProps={getInputProps(fields.cost, {
							type: 'number',
							step: '0.01',
						})}
						errors={fields.cost.errors}
					/>
				</div>
				{loaderData.assets.length ? (
					<div className="grid gap-1">
						<label
							htmlFor={fields.assetId.id}
							className="text-body-xs text-muted-foreground"
						>
							Related asset (optional)
						</label>
						<select
							id={fields.assetId.id}
							name={fields.assetId.name}
							defaultValue=""
							className="border-border/60 bg-background w-full rounded-md border px-3 py-2 text-sm"
						>
							<option value="">No asset linked</option>
							{loaderData.assets.map((asset) => (
								<option key={asset.id} value={asset.id}>
									{asset.assetType}
								</option>
							))}
						</select>
					</div>
				) : null}
				{loaderData.canReadVendors ? (
					<div className="grid gap-1">
						<label
							htmlFor={fields.vendorId.id}
							className="text-body-xs text-muted-foreground"
						>
							Vendor (optional)
						</label>
						<select
							id={fields.vendorId.id}
							name={fields.vendorId.name}
							defaultValue=""
							className="border-border/60 bg-background w-full rounded-md border px-3 py-2 text-sm"
						>
							<option value="">No vendor linked</option>
							{loaderData.vendors.map((vendor) => (
								<option key={vendor.id} value={vendor.id}>
									{vendor.name}
								</option>
							))}
						</select>
					</div>
				) : null}
				<div className="grid gap-1">
					<label
						htmlFor={fields.images.id}
						className="text-body-xs text-muted-foreground"
					>
						Photos (optional)
					</label>
					<input
						id={fields.images.id}
						name={fields.images.name}
						type="file"
						accept="image/*"
						multiple
						className="border-border/60 bg-background file:bg-muted w-full rounded-md border px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1 file:text-xs file:font-medium"
					/>
					<ErrorList errors={fields.images.errors} id={fields.images.errorId} />
				</div>
				<ErrorList errors={form.errors} id={form.errorId} />
				<StatusButton
					type="submit"
					status={isPending ? 'pending' : (form.status ?? 'idle')}
					disabled={isPending}
				>
					Log event
				</StatusButton>
			</Form>
		</div>
	)
}
