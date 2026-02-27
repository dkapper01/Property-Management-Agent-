import { prisma } from '#app/utils/db.server.ts'

export type TimelineEntryType =
	| 'note'
	| 'maintenance'
	| 'document'
	| 'lease'
	| 'asset'
	| 'finance'
	| 'event'
	| 'change'

export type TimelineEntry = {
	id: string
	type: TimelineEntryType
	occurredAt: Date
	title: string
	description?: string | null
	entityType?: string
	entityId?: string
	actor?: { id: string; name: string | null; username: string | null } | null
	actorType?: string | null
	actorLabel?: string | null
	metadata?: Record<string, unknown> | null
}

export async function getPropertyTimeline({
	organizationId,
	propertyId,
	limit,
	includeAuditLogs = true,
}: {
	organizationId: string
	propertyId: string
	limit?: number
	includeAuditLogs?: boolean
}) {
	const property = await prisma.property.findFirst({
		where: { id: propertyId, organizationId },
		select: { id: true, name: true },
	})
	if (!property) {
		throw new Response('Property not found', { status: 404 })
	}

	const [maintenanceEvents, documents, leases, assets, events] =
		await Promise.all([
			prisma.maintenanceEvent.findMany({
				where: { propertyId },
				select: {
					id: true,
					description: true,
					severity: true,
					status: true,
					dateReported: true,
					createdAt: true,
				},
				orderBy: { dateReported: 'desc' },
			}),
			prisma.document.findMany({
				where: { propertyId },
				select: {
					id: true,
					documentType: true,
					date: true,
					aiSummary: true,
					notes: true,
					createdAt: true,
				},
				orderBy: { date: 'desc' },
			}),
			prisma.lease.findMany({
				where: { propertyId },
				select: {
					id: true,
					tenantName: true,
					leaseStartDate: true,
					leaseEndDate: true,
					createdAt: true,
				},
				orderBy: { leaseStartDate: 'desc' },
			}),
			prisma.asset.findMany({
				where: { propertyId },
				select: {
					id: true,
					assetType: true,
					brandModel: true,
					installDate: true,
					createdAt: true,
				},
				orderBy: { createdAt: 'desc' },
			}),
			prisma.timelineEvent.findMany({
				where: { propertyId, organizationId },
				select: {
					id: true,
					type: true,
					message: true,
					metadata: true,
					createdAt: true,
					actor: { select: { id: true, name: true, username: true } },
					actorType: true,
					actorLabel: true,
					entityNoteId: true,
					maintenanceEventId: true,
					documentId: true,
					leaseId: true,
					assetId: true,
				},
				orderBy: { createdAt: 'desc' },
			}),
		])

	const financialEntries = await prisma.financialEntry.findMany({
		where: { propertyId, organizationId },
		select: {
			id: true,
			category: true,
			amount: true,
			date: true,
			notes: true,
			createdAt: true,
			maintenanceEvent: { select: { id: true, description: true } },
			vendor: { select: { id: true, name: true } },
		},
		orderBy: { date: 'desc' },
	})

	const maintenanceIds = maintenanceEvents.map((item) => item.id)
	const documentIds = documents.map((item) => item.id)
	const leaseIds = leases.map((item) => item.id)
	const assetIds = assets.map((item) => item.id)

	const noteOr = [
		{ entityType: 'property', entityId: propertyId },
		assetIds.length
			? { entityType: 'asset', entityId: { in: assetIds } }
			: null,
		maintenanceIds.length
			? {
					entityType: 'maintenance-event',
					entityId: { in: maintenanceIds },
				}
			: null,
		documentIds.length
			? { entityType: 'document', entityId: { in: documentIds } }
			: null,
		leaseIds.length ? { entityType: 'lease', entityId: { in: leaseIds } } : null,
	].filter(Boolean) as Array<Record<string, unknown>>

	const notes = noteOr.length
		? await prisma.entityNote.findMany({
				where: {
					organizationId,
					OR: noteOr,
				},
				select: {
					id: true,
					body: true,
					isDecisionNote: true,
					createdAt: true,
					entityType: true,
					entityId: true,
					createdBy: {
						select: { id: true, name: true, username: true },
					},
				},
				orderBy: { createdAt: 'desc' },
			})
		: []

	const noteIds = notes.map((item) => item.id)
	const financialEntryIds = financialEntries.map((entry) => entry.id)

	const auditOr = [
		{ entityType: 'property', entityId: propertyId },
		maintenanceIds.length
			? { entityType: 'maintenance-event', entityId: { in: maintenanceIds } }
			: null,
		noteIds.length ? { entityType: 'entity-note', entityId: { in: noteIds } } : null,
		documentIds.length
			? { entityType: 'document', entityId: { in: documentIds } }
			: null,
		leaseIds.length ? { entityType: 'lease', entityId: { in: leaseIds } } : null,
		assetIds.length ? { entityType: 'asset', entityId: { in: assetIds } } : null,
		financialEntryIds.length
			? { entityType: 'financial-entry', entityId: { in: financialEntryIds } }
			: null,
	].filter(Boolean) as Array<Record<string, unknown>>

	const auditLogs = includeAuditLogs && auditOr.length
		? await prisma.auditLog.findMany({
				where: { organizationId, OR: auditOr },
				select: {
					id: true,
					action: true,
					entityType: true,
					entityId: true,
					before: true,
					after: true,
					createdAt: true,
					actor: { select: { id: true, name: true, username: true } },
					actorType: true,
					actorLabel: true,
				},
				orderBy: { createdAt: 'desc' },
			})
		: []

	const assetById = Object.fromEntries(assets.map((asset) => [asset.id, asset]))
	const maintenanceById = Object.fromEntries(
		maintenanceEvents.map((event) => [event.id, event]),
	)
	const documentById = Object.fromEntries(
		documents.map((document) => [document.id, document]),
	)
	const leaseById = Object.fromEntries(leases.map((lease) => [lease.id, lease]))

	const noteEntries: TimelineEntry[] = notes.map((note): TimelineEntry => {
		const contextLabel =
			note.entityType === 'property'
				? property.name
				: note.entityType === 'asset'
					? assetById[note.entityId]?.assetType
					: note.entityType === 'maintenance-event'
						? maintenanceById[note.entityId]?.description
						: note.entityType === 'document'
							? documentById[note.entityId]?.documentType
							: note.entityType === 'lease'
								? leaseById[note.entityId]?.tenantName ?? 'Lease'
								: undefined

		return {
			id: `note-${note.id}`,
			type: 'note',
			occurredAt: note.createdAt,
			title: note.isDecisionNote ? 'Decision note' : 'Note',
			description: note.body,
			entityType: 'entity-note',
			entityId: note.id,
			actor: note.createdBy,
			actorType: note.createdBy ? 'USER' : null,
			actorLabel:
				note.createdBy?.name ?? note.createdBy?.username ?? undefined,
			metadata: {
				entityType: note.entityType,
				entityId: note.entityId,
				entityLabel: contextLabel,
			},
		}
	})

	const maintenanceEntries: TimelineEntry[] = maintenanceEvents.map(
		(event): TimelineEntry => ({
			id: `maintenance-${event.id}`,
			type: 'maintenance',
			occurredAt: event.dateReported,
			title: 'Maintenance event',
			description: event.description,
			entityType: 'maintenance-event',
			entityId: event.id,
			metadata: {
				severity: event.severity,
				status: event.status,
			},
		}),
	)

	const documentEntries: TimelineEntry[] = documents.map(
		(document): TimelineEntry => ({
			id: `document-${document.id}`,
			type: 'document',
			occurredAt: document.date ?? document.createdAt,
			title: document.documentType ?? 'Document',
			description: document.aiSummary ?? document.notes,
			entityType: 'document',
			entityId: document.id,
			metadata: null,
		}),
	)

	const leaseEntries: TimelineEntry[] = leases.map((lease): TimelineEntry => ({
		id: `lease-${lease.id}`,
		type: 'lease',
		occurredAt: lease.leaseStartDate,
		title: lease.tenantName || 'Tenant lease',
		description: lease.leaseEndDate
			? `${lease.leaseStartDate.toISOString().slice(0, 10)} → ${lease.leaseEndDate
					.toISOString()
					.slice(0, 10)}`
			: `${lease.leaseStartDate.toISOString().slice(0, 10)} → Ongoing`,
		entityType: 'lease',
		entityId: lease.id,
	}))

	const assetEntries: TimelineEntry[] = assets.map((asset): TimelineEntry => ({
		id: `asset-${asset.id}`,
		type: 'asset',
		occurredAt: asset.installDate ?? asset.createdAt,
		title: asset.assetType,
		description: asset.brandModel ?? undefined,
		entityType: 'asset',
		entityId: asset.id,
		actor: null,
		metadata: null,
	}))

	const financeEntries: TimelineEntry[] = financialEntries.map(
		(entry): TimelineEntry => ({
			id: `finance-${entry.id}`,
			type: 'finance',
			occurredAt: entry.date ?? entry.createdAt,
			title: `${entry.category} ${entry.amount.toFixed(2)}`,
			description: entry.notes,
			entityType: 'financial-entry',
			entityId: entry.id,
			metadata: {
				category: entry.category,
				amount: entry.amount,
				vendorName: entry.vendor?.name,
				maintenanceDescription: entry.maintenanceEvent?.description,
			},
		}),
	)

	const eventEntries: TimelineEntry[] = events.map((event): TimelineEntry => ({
		id: `event-${event.id}`,
		type: 'event',
		occurredAt: event.createdAt,
		title: event.type.replace(/_/g, ' ').toLowerCase(),
		description: event.message,
		entityType: 'timeline-event',
		entityId: event.id,
		actor: event.actor,
		actorType: event.actorType,
		actorLabel: event.actorLabel ?? undefined,
		metadata: event.metadata as Record<string, unknown> | null,
	}))

	const auditEntries: TimelineEntry[] = auditLogs.map((log): TimelineEntry => ({
		id: `audit-${log.id}`,
		type: 'change',
		occurredAt: log.createdAt,
		title: `${log.action} ${log.entityType}`,
		description: null,
		entityType: 'audit-log',
		entityId: log.id,
		actor: log.actor,
		actorType: log.actorType,
		actorLabel: log.actorLabel ?? undefined,
		metadata: {
			action: log.action,
			entityType: log.entityType,
			entityId: log.entityId,
			before: log.before,
			after: log.after,
		},
	}))

	const timeline: TimelineEntry[] = [
		...noteEntries,
		...maintenanceEntries,
		...documentEntries,
		...leaseEntries,
		...assetEntries,
		...financeEntries,
		...eventEntries,
		...auditEntries,
	]

	timeline.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())

	return limit ? timeline.slice(0, limit) : timeline
}
