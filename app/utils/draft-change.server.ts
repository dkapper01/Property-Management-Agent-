import { Prisma, PrismaClient, type ActorType } from '@prisma/client'
import { z } from 'zod'
import { writeAuditLog } from '#app/utils/audit.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	assertMembershipPermission,
	type MembershipWithRole,
} from '#app/utils/membership.server.ts'
import { type PermissionString } from '#app/utils/user.ts'

const PropertySchema = z.object({
	name: z.string({ required_error: 'Property name is required' }).min(1),
	address: z.string({ required_error: 'Address is required' }).min(1),
	country: z.string().optional().nullable(),
	purchaseDate: z.string().optional(),
	purchasePrice: z.number().optional(),
	ownershipType: z.enum(['INDIVIDUAL', 'LLC', 'PARTNERSHIP']).optional(),
	status: z
		.enum(['OWNER_OCCUPIED', 'RENTED', 'VACANT', 'RENOVATING'])
		.optional(),
	notes: z.string().optional().nullable(),
})

const CreateMaintenanceSchema = z.object({
	propertyId: z.string().min(1),
	description: z.string().min(1),
	dateReported: z.string().optional(),
	severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
	status: z.enum(['OPEN', 'RESOLVED']).optional(),
	cost: z.number().optional().nullable(),
	assetId: z.string().min(1).optional().nullable(),
	vendorId: z.string().min(1).optional().nullable(),
})

const UpdateMaintenanceSchema = z.object({
	status: z.enum(['OPEN', 'RESOLVED']),
})

const CreateAssetSchema = z.object({
	propertyId: z.string().min(1),
	assetType: z.enum([
		'ROOF',
		'HVAC',
		'WATER_HEATER',
		'APPLIANCES',
		'PLUMBING',
		'ELECTRICAL',
		'OTHER',
	]),
	installDate: z.string().optional().nullable(),
	brandModel: z.string().optional().nullable(),
	notes: z.string().optional().nullable(),
})

const CreateNoteSchema = z.object({
	entityType: z.enum(['property', 'asset', 'maintenance-event', 'document', 'lease']),
	entityId: z.string().min(1),
	body: z.string().min(1),
	tags: z.array(z.string().min(1)).optional().nullable(),
	isDecisionNote: z.boolean().optional().nullable(),
})

const CreateLeaseSchema = z.object({
	propertyId: z.string().min(1),
	tenantName: z.string().min(1),
	leaseStartDate: z.string().min(1),
	leaseEndDate: z.string().optional().nullable(),
	monthlyRent: z.number().optional(),
	securityDeposit: z.number().optional(),
	paymentDueDay: z.number().int().min(1).max(31).optional(),
})

const CreateFinancialEntrySchema = z.object({
	propertyId: z.string().min(1),
	category: z.enum([
		'RENT_INCOME',
		'MORTGAGE',
		'INSURANCE',
		'MAINTENANCE',
		'CAPEX',
		'UTILITIES',
		'HOA',
		'TAXES',
		'OTHER',
	]),
	amount: z.number().min(0),
	date: z.string().optional(),
	notes: z.string().optional().nullable(),
	vendorId: z.string().min(1).optional().nullable(),
	maintenanceEventId: z.string().min(1).optional().nullable(),
})

const CreateDocumentSchema = z.object({
	propertyId: z.string().min(1),
	documentType: z.enum([
		'LEASE',
		'INSURANCE',
		'INSPECTION',
		'MORTGAGE',
		'HOA',
		'WARRANTY',
		'OTHER',
	]),
	date: z.string().min(1),
	fileKey: z.string().min(1),
	aiSummary: z.string().optional().nullable(),
	notes: z.string().optional().nullable(),
	assetId: z.string().min(1).optional().nullable(),
})

const DraftCreateOperationSchema = z.object({
	op: z.literal('create'),
	entityType: z.enum([
		'property',
		'asset',
		'maintenance-event',
		'entity-note',
		'document',
		'lease',
		'financial-entry',
	]),
	data: z.record(z.string(), z.unknown()),
})

const DraftUpdateOperationSchema = z.object({
	op: z.literal('update'),
	entityType: z.literal('maintenance-event'),
	entityId: z.string().min(1),
	data: z.record(z.string(), z.unknown()),
})

export const DraftOperationSchema = z.discriminatedUnion('op', [
	DraftCreateOperationSchema,
	DraftUpdateOperationSchema,
])

export type DraftOperation = z.infer<typeof DraftOperationSchema>

const DraftOperationListSchema = z.array(DraftOperationSchema)

const draftPermissionMap: Record<
	DraftOperation['entityType'],
	PermissionString
> = {
	property: 'create:property:any',
	asset: 'create:asset:any',
	'maintenance-event': 'create:maintenance-event:any',
	'entity-note': 'create:entity-note:any',
	document: 'create:document:any',
	lease: 'create:lease:any',
	'financial-entry': 'create:financial-entry:any',
}

export function assertDraftPermissions(
	membership: MembershipWithRole,
	operations: DraftOperation[],
) {
	const requiredPermissions = new Set<PermissionString>()
	for (const operation of operations) {
		if (operation.op === 'update') {
			requiredPermissions.add('update:maintenance-event:any')
		} else {
			requiredPermissions.add(draftPermissionMap[operation.entityType])
		}
	}
	for (const permission of requiredPermissions) {
		assertMembershipPermission(membership, permission)
	}
}

async function assertPropertyAccess({
	organizationId,
	propertyId,
	client = prisma,
}: {
	organizationId: string
	propertyId: string
	client?: Prisma.TransactionClient | PrismaClient
}) {
	const property = await client.property.findFirst({
		where: { id: propertyId, organizationId },
		select: { id: true, name: true },
	})
	if (!property) throw new Error('Property not found')
	return property
}

async function assertAssetAccess({
	organizationId,
	assetId,
	client = prisma,
}: {
	organizationId: string
	assetId: string
	client?: Prisma.TransactionClient | PrismaClient
}) {
	const asset = await client.asset.findFirst({
		where: { id: assetId, property: { organizationId } },
		select: { id: true, assetType: true },
	})
	if (!asset) throw new Error('Asset not found')
	return asset
}

async function assertMaintenanceAccess({
	organizationId,
	maintenanceEventId,
	client = prisma,
}: {
	organizationId: string
	maintenanceEventId: string
	client?: Prisma.TransactionClient | PrismaClient
}) {
	const maintenance = await client.maintenanceEvent.findFirst({
		where: { id: maintenanceEventId, property: { organizationId } },
		select: { id: true, status: true, propertyId: true },
	})
	if (!maintenance) throw new Error('Maintenance event not found')
	return maintenance
}

async function assertNoteEntity({
	organizationId,
	entityType,
	entityId,
	client = prisma,
}: {
	organizationId: string
	entityType: z.infer<typeof CreateNoteSchema>['entityType']
	entityId: string
	client?: Prisma.TransactionClient | PrismaClient
}) {
	switch (entityType) {
		case 'property': {
			const property = await client.property.findFirst({
				where: { id: entityId, organizationId },
				select: { id: true, name: true },
			})
			if (!property) throw new Error('Property not found')
			return { label: property.name }
		}
		case 'asset': {
			const asset = await client.asset.findFirst({
				where: { id: entityId, property: { organizationId } },
				select: { id: true, assetType: true },
			})
			if (!asset) throw new Error('Asset not found')
			return { label: asset.assetType }
		}
		case 'maintenance-event': {
			const maintenance = await client.maintenanceEvent.findFirst({
				where: { id: entityId, property: { organizationId } },
				select: { id: true, description: true },
			})
			if (!maintenance) throw new Error('Maintenance event not found')
			return { label: maintenance.description }
		}
		case 'document': {
			const document = await client.document.findFirst({
				where: { id: entityId, property: { organizationId } },
				select: { id: true, documentType: true },
			})
			if (!document) throw new Error('Document not found')
			return { label: document.documentType }
		}
		case 'lease': {
			const lease = await client.lease.findFirst({
				where: { id: entityId, property: { organizationId } },
				select: { id: true, tenantName: true },
			})
			if (!lease) throw new Error('Lease not found')
			return { label: lease.tenantName }
		}
		default:
			throw new Error('Unsupported entity')
	}
}

type DraftActor = {
	actorId: string | null
	actorType: ActorType
	actorLabel?: string | null
	actorMetadata?: Prisma.InputJsonValue | null
}

function resolveDraftContentActor(
	draft: {
		proposedByType: ActorType | null
		proposedByLabel: string | null
		proposedByUserId: string | null
	},
	approvalActor: DraftActor,
) {
	const actorType = draft.proposedByType ?? approvalActor.actorType
	const actorLabel = draft.proposedByLabel ?? approvalActor.actorLabel
	const actorId =
		actorType === 'USER'
			? draft.proposedByUserId ?? approvalActor.actorId
			: null
	return {
		actorId,
		actorType,
		actorLabel: actorLabel ?? undefined,
		actorMetadata: approvalActor.actorMetadata ?? undefined,
	}
}

export async function applyDraftChange({
	draftId,
	membership,
	actor,
}: {
	draftId: string
	membership: MembershipWithRole
	actor: DraftActor
}) {
	if (actor.actorType !== 'USER') {
		throw new Response('Draft approvals require a human reviewer', {
			status: 403,
		})
	}
	const draft = await prisma.draftChange.findFirst({
		where: { id: draftId, organizationId: membership.organizationId },
	})
	if (!draft) {
		throw new Response('Draft not found', { status: 404 })
	}

	if (draft.status !== 'DRAFT') {
		throw new Response('Draft already processed', { status: 400 })
	}

	const operations = DraftOperationListSchema.parse(draft.operations)
	assertDraftPermissions(membership, operations)

	const contentActor = resolveDraftContentActor(draft, actor)
	const appliedEntities: Array<{ entityType: string; id: string }> = []

	await prisma.$transaction(
		async (tx) => {
			for (const operation of operations) {
			if (operation.op === 'create' && operation.entityType === 'property') {
				const data = PropertySchema.parse(operation.data)
				const property = await tx.property.create({
					data: {
						name: data.name,
						address: data.address,
						country: data.country,
						purchaseDate: data.purchaseDate
							? new Date(data.purchaseDate)
							: new Date(),
						purchasePrice: data.purchasePrice ?? 0,
						ownershipType: data.ownershipType ?? 'INDIVIDUAL',
						status: data.status ?? 'OWNER_OCCUPIED',
						notes: data.notes,
						organizationId: draft.organizationId,
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
						organizationId: draft.organizationId,
						actorId: actor.actorId,
						actorType: actor.actorType,
						actorLabel: actor.actorLabel,
						actorMetadata: actor.actorMetadata ?? undefined,
						before: null,
						after: property,
					},
					tx,
				)
				appliedEntities.push({ entityType: 'property', id: property.id })
			}

			if (operation.op === 'create' && operation.entityType === 'asset') {
				const data = CreateAssetSchema.parse(operation.data)
				await assertPropertyAccess({
					organizationId: draft.organizationId,
					propertyId: data.propertyId,
					client: tx,
				})
				const asset = await tx.asset.create({
					data: {
						propertyId: data.propertyId,
						assetType: data.assetType,
						installDate: data.installDate
							? new Date(data.installDate)
							: null,
						brandModel: data.brandModel ?? null,
						notes: data.notes ?? null,
					},
					select: {
						id: true,
						assetType: true,
						installDate: true,
						propertyId: true,
					},
				})
				await writeAuditLog(
					{
						action: 'CREATE',
						entityType: 'asset',
						entityId: asset.id,
						organizationId: draft.organizationId,
						actorId: actor.actorId,
						actorType: actor.actorType,
						actorLabel: actor.actorLabel,
						actorMetadata: actor.actorMetadata ?? undefined,
						before: null,
						after: asset,
					},
					tx,
				)
				await tx.timelineEvent.create({
					data: {
						type: 'ASSET_ADDED',
						message: 'Asset added',
						propertyId: asset.propertyId,
						organizationId: draft.organizationId,
						assetId: asset.id,
						draftChangeId: draft.id,
						actorId: contentActor.actorId ?? undefined,
						actorType: contentActor.actorType,
						actorLabel: contentActor.actorLabel ?? undefined,
						actorMetadata: contentActor.actorMetadata ?? undefined,
					},
					select: { id: true },
				})
				appliedEntities.push({ entityType: 'asset', id: asset.id })
			}

			if (operation.op === 'create' && operation.entityType === 'maintenance-event') {
				const data = CreateMaintenanceSchema.parse(operation.data)
				await assertPropertyAccess({
					organizationId: draft.organizationId,
					propertyId: data.propertyId,
					client: tx,
				})
				if (data.assetId) {
					await assertAssetAccess({
						organizationId: draft.organizationId,
						assetId: data.assetId,
						client: tx,
					})
				}
				const record = await tx.maintenanceEvent.create({
					data: {
						description: data.description,
						severity: data.severity ?? 'MEDIUM',
						status: data.status ?? 'OPEN',
						dateReported: data.dateReported
							? new Date(data.dateReported)
							: new Date(),
						cost: data.cost ?? null,
						propertyId: data.propertyId,
						assetId: data.assetId,
						vendorId: data.vendorId,
						imageKeys: [],
					},
					select: {
						id: true,
						description: true,
						severity: true,
						status: true,
						dateReported: true,
						propertyId: true,
					},
				})
				await writeAuditLog(
					{
						action: 'CREATE',
						entityType: 'maintenance-event',
						entityId: record.id,
						organizationId: draft.organizationId,
						actorId: actor.actorId,
						actorType: actor.actorType,
						actorLabel: actor.actorLabel,
						actorMetadata: actor.actorMetadata ?? undefined,
						before: null,
						after: record,
					},
					tx,
				)
				await tx.timelineEvent.create({
					data: {
						type: 'MAINTENANCE_CREATED',
						message: 'Maintenance event logged',
						propertyId: record.propertyId,
						organizationId: draft.organizationId,
						maintenanceEventId: record.id,
						draftChangeId: draft.id,
						actorId: contentActor.actorId ?? undefined,
						actorType: contentActor.actorType,
						actorLabel: contentActor.actorLabel ?? undefined,
						actorMetadata: contentActor.actorMetadata ?? undefined,
					},
					select: { id: true },
				})
				appliedEntities.push({
					entityType: 'maintenance-event',
					id: record.id,
				})
			}

			if (operation.op === 'update' && operation.entityType === 'maintenance-event') {
				const data = UpdateMaintenanceSchema.parse(operation.data)
				const existing = await assertMaintenanceAccess({
					organizationId: draft.organizationId,
					maintenanceEventId: operation.entityId,
					client: tx,
				})

				const updated = await tx.maintenanceEvent.update({
					where: { id: existing.id },
					data: { status: data.status },
					select: {
						id: true,
						status: true,
						propertyId: true,
					},
				})

				await writeAuditLog(
					{
						action: 'UPDATE',
						entityType: 'maintenance-event',
						entityId: updated.id,
						organizationId: draft.organizationId,
						actorId: actor.actorId,
						actorType: actor.actorType,
						actorLabel: actor.actorLabel,
						actorMetadata: actor.actorMetadata ?? undefined,
						before: { status: existing.status },
						after: { status: updated.status },
					},
					tx,
				)

				await tx.timelineEvent.create({
					data: {
						type: 'MAINTENANCE_STATUS_CHANGED',
						message: `Maintenance marked ${updated.status.toLowerCase()}`,
						propertyId: updated.propertyId,
						organizationId: draft.organizationId,
						maintenanceEventId: updated.id,
						draftChangeId: draft.id,
						actorId: contentActor.actorId ?? undefined,
						actorType: contentActor.actorType,
						actorLabel: contentActor.actorLabel ?? undefined,
						actorMetadata: contentActor.actorMetadata ?? undefined,
					},
					select: { id: true },
				})

				appliedEntities.push({
					entityType: 'maintenance-event',
					id: updated.id,
				})
			}

			if (operation.op === 'create' && operation.entityType === 'entity-note') {
				const data = CreateNoteSchema.parse(operation.data)
				await assertNoteEntity({
					organizationId: draft.organizationId,
					entityType: data.entityType,
					entityId: data.entityId,
					client: tx,
				})
				const note = await tx.entityNote.create({
					data: {
						entityType: data.entityType,
						entityId: data.entityId,
						body: data.body,
						tags: data.tags ?? [],
						isDecisionNote: data.isDecisionNote ?? false,
						organizationId: draft.organizationId,
						createdByType: contentActor.actorType,
						createdById:
							contentActor.actorType === 'USER'
								? contentActor.actorId
								: null,
					},
					select: {
						id: true,
						entityType: true,
						entityId: true,
						body: true,
						organizationId: true,
						createdByType: true,
						createdById: true,
						createdAt: true,
					},
				})

				await writeAuditLog(
					{
						action: 'CREATE',
						entityType: 'entity-note',
						entityId: note.id,
						organizationId: draft.organizationId,
						actorId: actor.actorId,
						actorType: actor.actorType,
						actorLabel: actor.actorLabel,
						actorMetadata: actor.actorMetadata ?? undefined,
						before: null,
						after: note,
					},
					tx,
				)
				let notePropertyId: string | null = null
				if (data.entityType === 'property') {
					notePropertyId = data.entityId
				} else if (data.entityType === 'asset') {
					const asset = await tx.asset.findFirst({
						where: { id: data.entityId, property: { organizationId: draft.organizationId } },
						select: { propertyId: true },
					})
					notePropertyId = asset?.propertyId ?? null
				} else if (data.entityType === 'maintenance-event') {
					const maintenance = await tx.maintenanceEvent.findFirst({
						where: { id: data.entityId, property: { organizationId: draft.organizationId } },
						select: { propertyId: true },
					})
					notePropertyId = maintenance?.propertyId ?? null
				} else if (data.entityType === 'document') {
					const document = await tx.document.findFirst({
						where: { id: data.entityId, property: { organizationId: draft.organizationId } },
						select: { propertyId: true },
					})
					notePropertyId = document?.propertyId ?? null
				} else if (data.entityType === 'lease') {
					const lease = await tx.lease.findFirst({
						where: { id: data.entityId, property: { organizationId: draft.organizationId } },
						select: { propertyId: true },
					})
					notePropertyId = lease?.propertyId ?? null
				}
				if (notePropertyId) {
					await tx.timelineEvent.create({
						data: {
							type: 'NOTE_ADDED',
							message: 'Note added',
							propertyId: notePropertyId,
							organizationId: draft.organizationId,
							entityNoteId: note.id,
							draftChangeId: draft.id,
							actorId: contentActor.actorId ?? undefined,
							actorType: contentActor.actorType,
							actorLabel: contentActor.actorLabel ?? undefined,
							actorMetadata: contentActor.actorMetadata ?? undefined,
						},
						select: { id: true },
					})
				}
				appliedEntities.push({
					entityType: 'entity-note',
					id: note.id,
				})
			}

			if (operation.op === 'create' && operation.entityType === 'document') {
				const data = CreateDocumentSchema.parse(operation.data)
				await assertPropertyAccess({
					organizationId: draft.organizationId,
					propertyId: data.propertyId,
					client: tx,
				})
				if (data.assetId) {
					await assertAssetAccess({
						organizationId: draft.organizationId,
						assetId: data.assetId,
						client: tx,
					})
				}
				const document = await tx.document.create({
					data: {
						propertyId: data.propertyId,
						documentType: data.documentType,
						date: new Date(data.date),
						fileKey: data.fileKey,
						aiSummary: data.aiSummary ?? null,
						notes: data.notes ?? null,
						assetId: data.assetId ?? null,
					},
					select: {
						id: true,
						documentType: true,
						date: true,
						propertyId: true,
					},
				})
				await writeAuditLog(
					{
						action: 'CREATE',
						entityType: 'document',
						entityId: document.id,
						organizationId: draft.organizationId,
						actorId: actor.actorId,
						actorType: actor.actorType,
						actorLabel: actor.actorLabel,
						actorMetadata: actor.actorMetadata ?? undefined,
						before: null,
						after: document,
					},
					tx,
				)
				await tx.timelineEvent.create({
					data: {
						type: 'DOCUMENT_ADDED',
						message: 'Document added',
						propertyId: document.propertyId,
						organizationId: draft.organizationId,
						documentId: document.id,
						draftChangeId: draft.id,
						actorId: contentActor.actorId ?? undefined,
						actorType: contentActor.actorType,
						actorLabel: contentActor.actorLabel ?? undefined,
						actorMetadata: contentActor.actorMetadata ?? undefined,
					},
					select: { id: true },
				})
				appliedEntities.push({ entityType: 'document', id: document.id })
			}

			if (operation.op === 'create' && operation.entityType === 'lease') {
				const data = CreateLeaseSchema.parse(operation.data)
				await assertPropertyAccess({
					organizationId: draft.organizationId,
					propertyId: data.propertyId,
					client: tx,
				})
				const lease = await tx.lease.create({
					data: {
						propertyId: data.propertyId,
						tenantName: data.tenantName,
						leaseStartDate: new Date(data.leaseStartDate),
						leaseEndDate: data.leaseEndDate
							? new Date(data.leaseEndDate)
							: null,
						monthlyRent: data.monthlyRent ?? 0,
						securityDeposit: data.securityDeposit ?? 0,
						paymentDueDay: data.paymentDueDay ?? 1,
					},
					select: {
						id: true,
						tenantName: true,
						leaseStartDate: true,
						leaseEndDate: true,
					},
				})

				await writeAuditLog(
					{
						action: 'CREATE',
						entityType: 'lease',
						entityId: lease.id,
						organizationId: draft.organizationId,
						actorId: actor.actorId,
						actorType: actor.actorType,
						actorLabel: actor.actorLabel,
						actorMetadata: actor.actorMetadata ?? undefined,
						before: null,
						after: lease,
					},
					tx,
				)
				await tx.timelineEvent.create({
					data: {
						type: 'LEASE_CREATED',
						message: 'Lease created',
						propertyId: data.propertyId,
						organizationId: draft.organizationId,
						leaseId: lease.id,
						draftChangeId: draft.id,
						actorId: contentActor.actorId ?? undefined,
						actorType: contentActor.actorType,
						actorLabel: contentActor.actorLabel ?? undefined,
						actorMetadata: contentActor.actorMetadata ?? undefined,
					},
					select: { id: true },
				})
				appliedEntities.push({ entityType: 'lease', id: lease.id })
			}

			if (operation.op === 'create' && operation.entityType === 'financial-entry') {
				const data = CreateFinancialEntrySchema.parse(operation.data)
				await assertPropertyAccess({
					organizationId: draft.organizationId,
					propertyId: data.propertyId,
					client: tx,
				})
				const entry = await tx.financialEntry.create({
					data: {
						propertyId: data.propertyId,
						organizationId: draft.organizationId,
						category: data.category,
						amount: data.amount,
						date: data.date ? new Date(data.date) : new Date(),
						notes: data.notes,
						vendorId: data.vendorId,
						maintenanceEventId: data.maintenanceEventId,
					},
					select: {
						id: true,
						category: true,
						amount: true,
						date: true,
						propertyId: true,
					},
				})

				await writeAuditLog(
					{
						action: 'CREATE',
						entityType: 'financial-entry',
						entityId: entry.id,
						organizationId: draft.organizationId,
						actorId: actor.actorId,
						actorType: actor.actorType,
						actorLabel: actor.actorLabel,
						actorMetadata: actor.actorMetadata ?? undefined,
						before: null,
						after: entry,
					},
					tx,
				)
				await tx.timelineEvent.create({
					data: {
						type: 'FINANCIAL_ENTRY_ADDED',
						message: 'Financial entry added',
						propertyId: data.propertyId,
						organizationId: draft.organizationId,
						financialEntryId: entry.id,
						draftChangeId: draft.id,
						actorId: contentActor.actorId ?? undefined,
						actorType: contentActor.actorType,
						actorLabel: contentActor.actorLabel ?? undefined,
						actorMetadata: contentActor.actorMetadata ?? undefined,
					},
					select: { id: true },
				})
				appliedEntities.push({
					entityType: 'financial-entry',
					id: entry.id,
				})
			}
		}

		const updated = await tx.draftChange.update({
			where: { id: draft.id },
			data: {
				status: 'APPLIED',
				reviewedByUserId: actor.actorId ?? undefined,
				reviewedAt: new Date(),
				appliedAt: new Date(),
			},
			select: {
				id: true,
				status: true,
				reviewedByUserId: true,
				reviewedAt: true,
				appliedAt: true,
			},
		})

		await writeAuditLog(
			{
				action: 'UPDATE',
				entityType: 'draft-change',
				entityId: draft.id,
				organizationId: draft.organizationId,
				actorId: actor.actorId,
				actorType: actor.actorType,
				actorLabel: actor.actorLabel,
				actorMetadata: actor.actorMetadata ?? undefined,
				before: { status: draft.status },
				after: {
					status: updated.status,
					reviewedByUserId: updated.reviewedByUserId,
					reviewedAt: updated.reviewedAt,
					appliedAt: updated.appliedAt,
				},
			},
			tx,
		)
	},
	{ timeout: 20000 },
	)

	return {
		draftId: draft.id,
		status: 'APPLIED' as const,
		appliedEntities,
	}
}

export async function rejectDraftChange({
	draftId,
	membership,
	actor,
	reason,
}: {
	draftId: string
	membership: MembershipWithRole
	actor: DraftActor
	reason?: string | null
}) {
	if (actor.actorType !== 'USER') {
		throw new Response('Draft decisions require a human reviewer', {
			status: 403,
		})
	}
	const draft = await prisma.draftChange.findFirst({
		where: { id: draftId, organizationId: membership.organizationId },
	})
	if (!draft) {
		throw new Response('Draft not found', { status: 404 })
	}

	if (draft.status !== 'DRAFT') {
		throw new Response('Draft already processed', { status: 400 })
	}

	const operations = DraftOperationListSchema.parse(draft.operations)
	assertDraftPermissions(membership, operations)

	const updated = await prisma.draftChange.update({
		where: { id: draftId },
		data: {
			status: 'REJECTED',
			reviewedByUserId: actor.actorId ?? undefined,
			reviewedAt: new Date(),
			summary: reason ? `${draft.summary ?? ''} (${reason})` : draft.summary,
		},
		select: {
			id: true,
			status: true,
			reviewedByUserId: true,
			reviewedAt: true,
			summary: true,
		},
	})

	await writeAuditLog({
		action: 'UPDATE',
		entityType: 'draft-change',
		entityId: draft.id,
		organizationId: draft.organizationId,
		actorId: actor.actorId,
		actorType: actor.actorType,
		actorLabel: actor.actorLabel,
		actorMetadata: actor.actorMetadata ?? undefined,
		before: { status: draft.status, summary: draft.summary },
		after: {
			status: updated.status,
			summary: updated.summary,
			reviewedByUserId: updated.reviewedByUserId,
			reviewedAt: updated.reviewedAt,
		},
	})

	return { draftId: updated.id, status: updated.status }
}
