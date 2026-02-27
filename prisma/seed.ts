import { faker } from '@faker-js/faker'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'

const propertyMemoryEntities = [
	'organization',
	'membership',
	'property',
	'asset',
	'vendor',
	'document',
	'maintenance-event',
	'lease',
	'entity-note',
	'timeline-event',
	'financial-entry',
	'audit-log',
	'mcp-tool-invocation',
	'draft-change',
] as const

const propertyMemoryActions = ['create', 'read', 'update', 'delete'] as const
const propertyMemoryAccess = ['own', 'any'] as const

function getPropertyMemoryPermissions() {
	return propertyMemoryEntities.flatMap((entity) =>
		propertyMemoryActions.flatMap((action) =>
			propertyMemoryAccess.map((access) => ({
				entity,
				action,
				access,
				description: '',
			})),
		),
	)
}

async function seed() {
	console.log('🌱 Seeding...')

	console.time('🧹 Cleaned up existing data...')
	await prisma.mcpToolInvocation.deleteMany()
	await prisma.auditLog.deleteMany()
	await prisma.timelineEvent.deleteMany()
	await prisma.entityNote.deleteMany()
	await prisma.financialEntry.deleteMany()
	await prisma.maintenanceEvent.deleteMany()
	await prisma.lease.deleteMany()
	await prisma.document.deleteMany()
	await prisma.asset.deleteMany()
	await prisma.vendor.deleteMany()
	await prisma.property.deleteMany()
	await prisma.membership.deleteMany()
	await prisma.organization.deleteMany()
	await prisma.connection.deleteMany()
	await prisma.session.deleteMany()
	await prisma.passkey.deleteMany()
	await prisma.password.deleteMany()
	await prisma.user.deleteMany()
	console.timeEnd('🧹 Cleaned up existing data...')

	console.time('🔐 Ensured property memory permissions...')
	const propertyPermissions = getPropertyMemoryPermissions()
	for (const permission of propertyPermissions) {
		await prisma.permission.upsert({
			where: {
				action_entity_access: {
					action: permission.action,
					entity: permission.entity,
					access: permission.access,
				},
			},
			create: permission,
			update: { description: permission.description },
		})
	}

	const permissionRecords = await prisma.permission.findMany({
		select: { id: true, action: true, entity: true, access: true },
		where: { entity: { in: [...propertyMemoryEntities] } },
	})
	const permissionByKey = new Map(
		permissionRecords.map((permission) => [
			`${permission.action}:${permission.entity}:${permission.access}`,
			permission.id,
		]),
	)

	const allAnyPermissions = propertyPermissions.filter(
		(permission) => permission.access === 'any',
	)
	const ownerPermissions = allAnyPermissions
	const managerPermissions = allAnyPermissions.filter(
		(permission) =>
			!(
				permission.action === 'delete' &&
				permission.entity === 'organization' &&
				permission.access === 'any'
			),
	)

	const agentWritableEntities = new Set([
		'maintenance-event',
		'entity-note',
		'document',
	])
	const agentPermissions = allAnyPermissions.filter(
		(permission) =>
			permission.action === 'read' ||
			(['create', 'update'].includes(permission.action) &&
				agentWritableEntities.has(permission.entity)),
	)

	const aiAgentPermissions = allAnyPermissions.filter((permission) => {
		if (permission.action === 'read') return true
		if (permission.action === 'create') {
			return ['draft-change', 'entity-note'].includes(permission.entity)
		}
		return false
	})

	const roleDefinitions = [
		{
			name: 'owner',
			description: 'Organization owner',
			permissions: ownerPermissions,
		},
		{
			name: 'manager',
			description: 'Organization manager',
			permissions: managerPermissions,
		},
		{
			name: 'agent',
			description: 'Portfolio collaborator',
			permissions: agentPermissions,
		},
		{
			name: 'ai-agent',
			description: 'AI agent (read + draft-only)',
			permissions: aiAgentPermissions,
		},
	]

	for (const role of roleDefinitions) {
		const rolePermissionIds = role.permissions
			.map((permission) =>
				permissionByKey.get(
					`${permission.action}:${permission.entity}:${permission.access}`,
				),
			)
			.filter(Boolean)
			.map((id) => ({ id: id! }))

		await prisma.role.upsert({
			where: { name: role.name },
			create: {
				name: role.name,
				description: role.description,
				permissions: { connect: rolePermissionIds },
			},
			update: {
				description: role.description,
				permissions: { set: rolePermissionIds },
			},
		})
	}
	console.timeEnd('🔐 Ensured property memory permissions...')

	console.time('👤 Created users...')
	const ownerUser = await prisma.user.create({
		data: {
			...createUser(),
			name: 'Daniel Owner',
			email: 'owner@example.com',
			username: 'owner',
			password: { create: createPassword('password') },
		},
	})

	const managerUser = await prisma.user.create({
		data: {
			...createUser(),
			name: 'Morgan Manager',
			email: 'manager@example.com',
			username: 'manager',
			password: { create: createPassword('password') },
		},
	})

	const agentUser = await prisma.user.create({
		data: {
			...createUser(),
			name: 'Alex Agent',
			email: 'agent@example.com',
			username: 'agent',
			password: { create: createPassword('password') },
		},
	})
	console.timeEnd('👤 Created users...')

	const ownerRole = await prisma.role.findUnique({ where: { name: 'owner' } })
	const managerRole = await prisma.role.findUnique({ where: { name: 'manager' } })
	const agentRole = await prisma.role.findUnique({ where: { name: 'agent' } })
	if (!ownerRole || !managerRole || !agentRole) {
		throw new Error('Missing roles')
	}

	console.time('🏢 Created workspace and memberships...')
	const organization = await prisma.organization.create({
		data: {
			name: 'Sunset Property Group',
			memberships: {
				create: [
					{ userId: ownerUser.id, roleId: ownerRole.id },
					{ userId: managerUser.id, roleId: managerRole.id },
					{ userId: agentUser.id, roleId: agentRole.id },
				],
			},
		},
	})
	console.timeEnd('🏢 Created workspace and memberships...')

	const auditContext = {
		organizationId: organization.id,
		actorId: ownerUser.id,
		actorType: 'USER' as const,
		actorLabel: ownerUser.name ?? 'Owner',
	}

	async function logAudit({
		entityType,
		entityId,
		after,
	}: {
		entityType: string
		entityId: string
		after: Record<string, unknown>
	}) {
		const normalizedAfter = JSON.parse(JSON.stringify(after))
		await prisma.auditLog.create({
			data: {
				action: 'CREATE',
				entityType,
				entityId,
				organizationId: auditContext.organizationId,
				actorId: auditContext.actorId,
				actorType: auditContext.actorType,
				actorLabel: auditContext.actorLabel,
				before: null,
				after: normalizedAfter,
			},
		})
	}

	async function logTimelineEvent({
		type,
		message,
		propertyId,
		maintenanceEventId,
		documentId,
		entityNoteId,
		leaseId,
		assetId,
		financialEntryId,
	}: {
		type:
			| 'NOTE_ADDED'
			| 'MAINTENANCE_CREATED'
			| 'DOCUMENT_ADDED'
			| 'LEASE_CREATED'
			| 'ASSET_ADDED'
			| 'FINANCIAL_ENTRY_ADDED'
		message: string
		propertyId: string
		maintenanceEventId?: string
		documentId?: string
		entityNoteId?: string
		leaseId?: string
		assetId?: string
		financialEntryId?: string
	}) {
		await prisma.timelineEvent.create({
			data: {
				type,
				message,
				propertyId,
				organizationId: auditContext.organizationId,
				maintenanceEventId,
				documentId,
				entityNoteId,
				leaseId,
				assetId,
				financialEntryId,
				actorId: auditContext.actorId,
				actorType: auditContext.actorType,
				actorLabel: auditContext.actorLabel,
			},
		})
	}

	console.time('🏠 Created properties...')
	const propertyA = await prisma.property.create({
		data: {
			organizationId: organization.id,
			name: 'Sunset Villas',
			address: '123 Ocean Ave, Santa Monica, CA',
			country: 'US',
			purchaseDate: new Date('2020-05-15'),
			purchasePrice: 1250000,
			ownershipType: 'LLC',
			status: 'RENTED',
			notes: 'Primary rental property. Focus on maintenance history and lease terms.',
		},
	})

	const propertyB = await prisma.property.create({
		data: {
			organizationId: organization.id,
			name: 'Bosphorus Flat',
			address: '14 Serene Sokak, Istanbul',
			country: 'TR',
			purchaseDate: new Date('2022-11-03'),
			purchasePrice: 350000,
			ownershipType: 'INDIVIDUAL',
			status: 'VACANT',
			notes: 'Considering renovation before next lease.',
		},
	})
	console.timeEnd('🏠 Created properties...')

	console.time('🧰 Created assets, vendors, maintenance, leases, finances...')
	const vendor = await prisma.vendor.create({
		data: {
			organizationId: organization.id,
			name: 'Atlas Plumbing',
			category: 'Plumbing',
			phone: '+1 555 123 4567',
			email: 'support@atlasplumbing.com',
		},
	})
	await logAudit({ entityType: 'vendor', entityId: vendor.id, after: vendor })

	const waterHeater = await prisma.asset.create({
		data: {
			propertyId: propertyA.id,
			assetType: 'WATER_HEATER',
			installDate: new Date('2018-08-10'),
			brandModel: 'Rheem X200',
			notes: 'Installed before acquisition; monitor lifespan.',
		},
	})
	await logAudit({
		entityType: 'asset',
		entityId: waterHeater.id,
		after: {
			id: waterHeater.id,
			assetType: waterHeater.assetType,
			installDate: waterHeater.installDate,
			propertyId: waterHeater.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'ASSET_ADDED',
		message: 'Asset added',
		propertyId: propertyA.id,
		assetId: waterHeater.id,
	})

	const roofSunset = await prisma.asset.create({
		data: {
			propertyId: propertyA.id,
			assetType: 'ROOF',
			installDate: new Date('2005-06-01'),
			notes: 'Original roof; monitor for end-of-life.',
		},
	})
	await logAudit({
		entityType: 'asset',
		entityId: roofSunset.id,
		after: {
			id: roofSunset.id,
			assetType: roofSunset.assetType,
			installDate: roofSunset.installDate,
			propertyId: roofSunset.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'ASSET_ADDED',
		message: 'Asset added',
		propertyId: propertyA.id,
		assetId: roofSunset.id,
	})

	const hvacSunset = await prisma.asset.create({
		data: {
			propertyId: propertyA.id,
			assetType: 'HVAC',
			installDate: new Date('2016-09-15'),
			notes: 'HVAC serviced regularly.',
		},
	})
	await logAudit({
		entityType: 'asset',
		entityId: hvacSunset.id,
		after: {
			id: hvacSunset.id,
			assetType: hvacSunset.assetType,
			installDate: hvacSunset.installDate,
			propertyId: hvacSunset.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'ASSET_ADDED',
		message: 'Asset added',
		propertyId: propertyA.id,
		assetId: hvacSunset.id,
	})

	const electricalBosphorus = await prisma.asset.create({
		data: {
			propertyId: propertyB.id,
			assetType: 'ELECTRICAL',
			installDate: null,
			notes: 'Install date unknown; needs assessment.',
		},
	})
	await logAudit({
		entityType: 'asset',
		entityId: electricalBosphorus.id,
		after: {
			id: electricalBosphorus.id,
			assetType: electricalBosphorus.assetType,
			installDate: electricalBosphorus.installDate,
			propertyId: electricalBosphorus.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'ASSET_ADDED',
		message: 'Asset added',
		propertyId: propertyB.id,
		assetId: electricalBosphorus.id,
	})

	const roofBosphorus = await prisma.asset.create({
		data: {
			propertyId: propertyB.id,
			assetType: 'ROOF',
			installDate: new Date('2010-04-01'),
			notes: 'Roof from prior ownership.',
		},
	})
	await logAudit({
		entityType: 'asset',
		entityId: roofBosphorus.id,
		after: {
			id: roofBosphorus.id,
			assetType: roofBosphorus.assetType,
			installDate: roofBosphorus.installDate,
			propertyId: roofBosphorus.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'ASSET_ADDED',
		message: 'Asset added',
		propertyId: propertyB.id,
		assetId: roofBosphorus.id,
	})

	const maintenance2024 = await prisma.maintenanceEvent.create({
		data: {
			propertyId: propertyA.id,
			description: 'Tenant reported a slow leak under the sink. Scheduled inspection.',
			severity: 'MEDIUM',
			status: 'OPEN',
			dateReported: new Date('2024-02-10'),
			cost: null,
			assetId: waterHeater.id,
			vendorId: vendor.id,
			imageKeys: [],
		},
	})
	await logAudit({
		entityType: 'maintenance-event',
		entityId: maintenance2024.id,
		after: {
			id: maintenance2024.id,
			description: maintenance2024.description,
			severity: maintenance2024.severity,
			status: maintenance2024.status,
			dateReported: maintenance2024.dateReported,
			propertyId: maintenance2024.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'MAINTENANCE_CREATED',
		message: 'Maintenance event logged',
		propertyId: propertyA.id,
		maintenanceEventId: maintenance2024.id,
	})

	const maintenance2021 = await prisma.maintenanceEvent.create({
		data: {
			propertyId: propertyA.id,
			description: 'HVAC repair completed after cooling issue.',
			severity: 'HIGH',
			status: 'RESOLVED',
			dateReported: new Date('2021-07-10'),
			cost: 850,
			assetId: hvacSunset.id,
			vendorId: vendor.id,
			imageKeys: [],
		},
	})
	await logAudit({
		entityType: 'maintenance-event',
		entityId: maintenance2021.id,
		after: {
			id: maintenance2021.id,
			description: maintenance2021.description,
			severity: maintenance2021.severity,
			status: maintenance2021.status,
			dateReported: maintenance2021.dateReported,
			propertyId: maintenance2021.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'MAINTENANCE_CREATED',
		message: 'Maintenance event logged',
		propertyId: propertyA.id,
		maintenanceEventId: maintenance2021.id,
	})

	const maintenance2023Roof = await prisma.maintenanceEvent.create({
		data: {
			propertyId: propertyA.id,
			description: 'Roof inspection completed.',
			severity: 'LOW',
			status: 'RESOLVED',
			dateReported: new Date('2023-03-02'),
			cost: 300,
			assetId: roofSunset.id,
			vendorId: vendor.id,
			imageKeys: [],
		},
	})
	await logAudit({
		entityType: 'maintenance-event',
		entityId: maintenance2023Roof.id,
		after: {
			id: maintenance2023Roof.id,
			description: maintenance2023Roof.description,
			severity: maintenance2023Roof.severity,
			status: maintenance2023Roof.status,
			dateReported: maintenance2023Roof.dateReported,
			propertyId: maintenance2023Roof.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'MAINTENANCE_CREATED',
		message: 'Maintenance event logged',
		propertyId: propertyA.id,
		maintenanceEventId: maintenance2023Roof.id,
	})

	const maintenance2020Panel = await prisma.maintenanceEvent.create({
		data: {
			propertyId: propertyA.id,
			description: 'Electrical panel issue resolved.',
			severity: 'CRITICAL',
			status: 'RESOLVED',
			dateReported: new Date('2020-11-18'),
			cost: 1400,
			assetId: null,
			vendorId: vendor.id,
			imageKeys: [],
		},
	})
	await logAudit({
		entityType: 'maintenance-event',
		entityId: maintenance2020Panel.id,
		after: {
			id: maintenance2020Panel.id,
			description: maintenance2020Panel.description,
			severity: maintenance2020Panel.severity,
			status: maintenance2020Panel.status,
			dateReported: maintenance2020Panel.dateReported,
			propertyId: maintenance2020Panel.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'MAINTENANCE_CREATED',
		message: 'Maintenance event logged',
		propertyId: propertyA.id,
		maintenanceEventId: maintenance2020Panel.id,
	})

	const maintenanceBosphorusOpen = await prisma.maintenanceEvent.create({
		data: {
			propertyId: propertyB.id,
			description: 'Bathroom tile damage reported.',
			severity: 'MEDIUM',
			status: 'OPEN',
			dateReported: new Date('2023-12-01'),
			cost: null,
			assetId: null,
			vendorId: null,
			imageKeys: [],
		},
	})
	await logAudit({
		entityType: 'maintenance-event',
		entityId: maintenanceBosphorusOpen.id,
		after: {
			id: maintenanceBosphorusOpen.id,
			description: maintenanceBosphorusOpen.description,
			severity: maintenanceBosphorusOpen.severity,
			status: maintenanceBosphorusOpen.status,
			dateReported: maintenanceBosphorusOpen.dateReported,
			propertyId: maintenanceBosphorusOpen.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'MAINTENANCE_CREATED',
		message: 'Maintenance event logged',
		propertyId: propertyB.id,
		maintenanceEventId: maintenanceBosphorusOpen.id,
	})

	const maintenanceBosphorusResolved = await prisma.maintenanceEvent.create({
		data: {
			propertyId: propertyB.id,
			description: 'Water pressure issue resolved.',
			severity: 'LOW',
			status: 'RESOLVED',
			dateReported: new Date('2022-05-15'),
			cost: 150,
			assetId: null,
			vendorId: null,
			imageKeys: [],
		},
	})
	await logAudit({
		entityType: 'maintenance-event',
		entityId: maintenanceBosphorusResolved.id,
		after: {
			id: maintenanceBosphorusResolved.id,
			description: maintenanceBosphorusResolved.description,
			severity: maintenanceBosphorusResolved.severity,
			status: maintenanceBosphorusResolved.status,
			dateReported: maintenanceBosphorusResolved.dateReported,
			propertyId: maintenanceBosphorusResolved.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'MAINTENANCE_CREATED',
		message: 'Maintenance event logged',
		propertyId: propertyB.id,
		maintenanceEventId: maintenanceBosphorusResolved.id,
	})

	const lease2024 = await prisma.lease.create({
		data: {
			propertyId: propertyA.id,
			tenantName: 'Alex Rivera',
			leaseStartDate: new Date('2024-01-01'),
			leaseEndDate: new Date('2024-12-31'),
			monthlyRent: 3200,
			securityDeposit: 3200,
			paymentDueDay: 1,
		},
	})
	await logAudit({
		entityType: 'lease',
		entityId: lease2024.id,
		after: {
			id: lease2024.id,
			tenantName: lease2024.tenantName,
			leaseStartDate: lease2024.leaseStartDate,
			leaseEndDate: lease2024.leaseEndDate,
			propertyId: lease2024.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'LEASE_CREATED',
		message: 'Lease created',
		propertyId: propertyA.id,
		leaseId: lease2024.id,
	})

	const lease2022 = await prisma.lease.create({
		data: {
			propertyId: propertyA.id,
			tenantName: 'Maria Gomez',
			leaseStartDate: new Date('2022-01-01'),
			leaseEndDate: new Date('2022-12-31'),
			monthlyRent: 3000,
			securityDeposit: 3000,
			paymentDueDay: 1,
		},
	})
	await logAudit({
		entityType: 'lease',
		entityId: lease2022.id,
		after: {
			id: lease2022.id,
			tenantName: lease2022.tenantName,
			leaseStartDate: lease2022.leaseStartDate,
			leaseEndDate: lease2022.leaseEndDate,
			propertyId: lease2022.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'LEASE_CREATED',
		message: 'Lease created',
		propertyId: propertyA.id,
		leaseId: lease2022.id,
	})

	const lease2023 = await prisma.lease.create({
		data: {
			propertyId: propertyA.id,
			tenantName: 'Alex Rivera',
			leaseStartDate: new Date('2023-01-01'),
			leaseEndDate: null,
			monthlyRent: 3100,
			securityDeposit: 3100,
			paymentDueDay: 1,
		},
	})
	await logAudit({
		entityType: 'lease',
		entityId: lease2023.id,
		after: {
			id: lease2023.id,
			tenantName: lease2023.tenantName,
			leaseStartDate: lease2023.leaseStartDate,
			leaseEndDate: lease2023.leaseEndDate,
			propertyId: lease2023.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'LEASE_CREATED',
		message: 'Lease created',
		propertyId: propertyA.id,
		leaseId: lease2023.id,
	})

	const financeMaintenance = await prisma.financialEntry.create({
		data: {
			organizationId: organization.id,
			propertyId: propertyA.id,
			category: 'MAINTENANCE',
			amount: 250,
			date: new Date('2024-02-12'),
			notes: 'Plumbing inspection deposit',
			vendorId: vendor.id,
		},
	})
	await logAudit({
		entityType: 'financial-entry',
		entityId: financeMaintenance.id,
		after: {
			id: financeMaintenance.id,
			category: financeMaintenance.category,
			amount: financeMaintenance.amount,
			date: financeMaintenance.date,
			propertyId: financeMaintenance.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'FINANCIAL_ENTRY_ADDED',
		message: 'Financial entry added',
		propertyId: propertyA.id,
		financialEntryId: financeMaintenance.id,
	})

	const financeRentJan = await prisma.financialEntry.create({
		data: {
			organizationId: organization.id,
			propertyId: propertyA.id,
			category: 'RENT_INCOME',
			amount: 3200,
			date: new Date('2024-01-05'),
			notes: 'January rent',
		},
	})
	const financeRentFeb = await prisma.financialEntry.create({
		data: {
			organizationId: organization.id,
			propertyId: propertyA.id,
			category: 'RENT_INCOME',
			amount: 3200,
			date: new Date('2024-02-05'),
			notes: 'February rent',
		},
	})
	const financeRentMar = await prisma.financialEntry.create({
		data: {
			organizationId: organization.id,
			propertyId: propertyA.id,
			category: 'RENT_INCOME',
			amount: 3200,
			date: new Date('2024-03-05'),
			notes: 'March rent',
		},
	})
	for (const entry of [financeRentJan, financeRentFeb, financeRentMar]) {
		await logAudit({
			entityType: 'financial-entry',
			entityId: entry.id,
			after: {
				id: entry.id,
				category: entry.category,
				amount: entry.amount,
				date: entry.date,
				propertyId: entry.propertyId,
			},
		})
		await logTimelineEvent({
			type: 'FINANCIAL_ENTRY_ADDED',
			message: 'Financial entry added',
			propertyId: propertyA.id,
			financialEntryId: entry.id,
		})
	}

	const financeMortgageJan = await prisma.financialEntry.create({
		data: {
			organizationId: organization.id,
			propertyId: propertyA.id,
			category: 'MORTGAGE',
			amount: 4100,
			date: new Date('2024-01-15'),
			notes: 'January mortgage',
		},
	})
	const financeMortgageFeb = await prisma.financialEntry.create({
		data: {
			organizationId: organization.id,
			propertyId: propertyA.id,
			category: 'MORTGAGE',
			amount: 4100,
			date: new Date('2024-02-15'),
			notes: 'February mortgage',
		},
	})
	const financeMortgageMar = await prisma.financialEntry.create({
		data: {
			organizationId: organization.id,
			propertyId: propertyA.id,
			category: 'MORTGAGE',
			amount: 4100,
			date: new Date('2024-03-15'),
			notes: 'March mortgage',
		},
	})
	for (const entry of [
		financeMortgageJan,
		financeMortgageFeb,
		financeMortgageMar,
	]) {
		await logAudit({
			entityType: 'financial-entry',
			entityId: entry.id,
			after: {
				id: entry.id,
				category: entry.category,
				amount: entry.amount,
				date: entry.date,
				propertyId: entry.propertyId,
			},
		})
		await logTimelineEvent({
			type: 'FINANCIAL_ENTRY_ADDED',
			message: 'Financial entry added',
			propertyId: propertyA.id,
			financialEntryId: entry.id,
		})
	}

	const financeInsurance = await prisma.financialEntry.create({
		data: {
			organizationId: organization.id,
			propertyId: propertyA.id,
			category: 'INSURANCE',
			amount: 1800,
			date: new Date('2023-01-10'),
			notes: 'Annual insurance premium',
		},
	})
	await logAudit({
		entityType: 'financial-entry',
		entityId: financeInsurance.id,
		after: {
			id: financeInsurance.id,
			category: financeInsurance.category,
			amount: financeInsurance.amount,
			date: financeInsurance.date,
			propertyId: financeInsurance.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'FINANCIAL_ENTRY_ADDED',
		message: 'Financial entry added',
		propertyId: propertyA.id,
		financialEntryId: financeInsurance.id,
	})

	const financeCapex = await prisma.financialEntry.create({
		data: {
			organizationId: organization.id,
			propertyId: propertyA.id,
			category: 'CAPEX',
			amount: 850,
			date: new Date('2021-07-10'),
			notes: 'HVAC repair capex',
			maintenanceEventId: maintenance2021.id,
		},
	})
	await logAudit({
		entityType: 'financial-entry',
		entityId: financeCapex.id,
		after: {
			id: financeCapex.id,
			category: financeCapex.category,
			amount: financeCapex.amount,
			date: financeCapex.date,
			propertyId: financeCapex.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'FINANCIAL_ENTRY_ADDED',
		message: 'Financial entry added',
		propertyId: propertyA.id,
		financialEntryId: financeCapex.id,
	})

	const financeTaxes = await prisma.financialEntry.create({
		data: {
			organizationId: organization.id,
			propertyId: propertyA.id,
			category: 'TAXES',
			amount: 6200,
			date: new Date('2023-12-15'),
			notes: 'Annual property taxes',
		},
	})
	await logAudit({
		entityType: 'financial-entry',
		entityId: financeTaxes.id,
		after: {
			id: financeTaxes.id,
			category: financeTaxes.category,
			amount: financeTaxes.amount,
			date: financeTaxes.date,
			propertyId: financeTaxes.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'FINANCIAL_ENTRY_ADDED',
		message: 'Financial entry added',
		propertyId: propertyA.id,
		financialEntryId: financeTaxes.id,
	})

	const financeBosphorusCapex = await prisma.financialEntry.create({
		data: {
			organizationId: organization.id,
			propertyId: propertyB.id,
			category: 'CAPEX',
			amount: 5000,
			date: new Date('2023-01-20'),
			notes: 'Renovation expenses',
		},
	})
	await logAudit({
		entityType: 'financial-entry',
		entityId: financeBosphorusCapex.id,
		after: {
			id: financeBosphorusCapex.id,
			category: financeBosphorusCapex.category,
			amount: financeBosphorusCapex.amount,
			date: financeBosphorusCapex.date,
			propertyId: financeBosphorusCapex.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'FINANCIAL_ENTRY_ADDED',
		message: 'Financial entry added',
		propertyId: propertyB.id,
		financialEntryId: financeBosphorusCapex.id,
	})

	const financeBosphorusTaxes = await prisma.financialEntry.create({
		data: {
			organizationId: organization.id,
			propertyId: propertyB.id,
			category: 'TAXES',
			amount: 1200,
			date: new Date('2023-10-01'),
			notes: 'Annual property taxes',
		},
	})
	await logAudit({
		entityType: 'financial-entry',
		entityId: financeBosphorusTaxes.id,
		after: {
			id: financeBosphorusTaxes.id,
			category: financeBosphorusTaxes.category,
			amount: financeBosphorusTaxes.amount,
			date: financeBosphorusTaxes.date,
			propertyId: financeBosphorusTaxes.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'FINANCIAL_ENTRY_ADDED',
		message: 'Financial entry added',
		propertyId: propertyB.id,
		financialEntryId: financeBosphorusTaxes.id,
	})

	const noteLeaseContext = await prisma.entityNote.create({
		data: {
			organizationId: organization.id,
			entityType: 'property',
			entityId: propertyA.id,
			body: '## Lease context\nTenant has been responsive; check for recurring plumbing issues.',
			tags: ['lease', 'maintenance'],
			isDecisionNote: false,
			createdByType: 'USER',
			createdById: ownerUser.id,
		},
	})
	await logAudit({
		entityType: 'entity-note',
		entityId: noteLeaseContext.id,
		after: {
			id: noteLeaseContext.id,
			entityType: noteLeaseContext.entityType,
			entityId: noteLeaseContext.entityId,
			body: noteLeaseContext.body,
		},
	})
	await logTimelineEvent({
		type: 'NOTE_ADDED',
		message: 'Note added',
		propertyId: propertyA.id,
		entityNoteId: noteLeaseContext.id,
	})

	const noteHvacDecision = await prisma.entityNote.create({
		data: {
			organizationId: organization.id,
			entityType: 'asset',
			entityId: hvacSunset.id,
			body: 'Chose repair over full HVAC replacement due to budget constraints.',
			tags: ['decision', 'hvac'],
			isDecisionNote: true,
			createdByType: 'USER',
			createdById: ownerUser.id,
		},
	})
	await logAudit({
		entityType: 'entity-note',
		entityId: noteHvacDecision.id,
		after: {
			id: noteHvacDecision.id,
			entityType: noteHvacDecision.entityType,
			entityId: noteHvacDecision.entityId,
			body: noteHvacDecision.body,
		},
	})
	await logTimelineEvent({
		type: 'NOTE_ADDED',
		message: 'Decision note added',
		propertyId: propertyA.id,
		entityNoteId: noteHvacDecision.id,
	})

	const noteRoofAging = await prisma.entityNote.create({
		data: {
			organizationId: organization.id,
			entityType: 'asset',
			entityId: roofSunset.id,
			body: 'Roof nearing end of typical 20-year lifespan.',
			tags: ['roof', 'lifecycle'],
			isDecisionNote: false,
			createdByType: 'USER',
			createdById: ownerUser.id,
		},
	})
	await logAudit({
		entityType: 'entity-note',
		entityId: noteRoofAging.id,
		after: {
			id: noteRoofAging.id,
			entityType: noteRoofAging.entityType,
			entityId: noteRoofAging.entityId,
			body: noteRoofAging.body,
		},
	})
	await logTimelineEvent({
		type: 'NOTE_ADDED',
		message: 'Note added',
		propertyId: propertyA.id,
		entityNoteId: noteRoofAging.id,
	})

	const noteRentIncrease = await prisma.entityNote.create({
		data: {
			organizationId: organization.id,
			entityType: 'property',
			entityId: propertyA.id,
			body: 'Considering rent increase for 2025 cycle.',
			tags: ['rent', 'planning'],
			isDecisionNote: true,
			createdByType: 'USER',
			createdById: ownerUser.id,
		},
	})
	await logAudit({
		entityType: 'entity-note',
		entityId: noteRentIncrease.id,
		after: {
			id: noteRentIncrease.id,
			entityType: noteRentIncrease.entityType,
			entityId: noteRentIncrease.entityId,
			body: noteRentIncrease.body,
		},
	})
	await logTimelineEvent({
		type: 'NOTE_ADDED',
		message: 'Decision note added',
		propertyId: propertyA.id,
		entityNoteId: noteRentIncrease.id,
	})

	const noteRenovation = await prisma.entityNote.create({
		data: {
			organizationId: organization.id,
			entityType: 'property',
			entityId: propertyB.id,
			body: 'Renovation strategy for Bosphorus Flat pending contractor estimates.',
			tags: ['renovation', 'planning'],
			isDecisionNote: true,
			createdByType: 'USER',
			createdById: ownerUser.id,
		},
	})
	await logAudit({
		entityType: 'entity-note',
		entityId: noteRenovation.id,
		after: {
			id: noteRenovation.id,
			entityType: noteRenovation.entityType,
			entityId: noteRenovation.entityId,
			body: noteRenovation.body,
		},
	})
	await logTimelineEvent({
		type: 'NOTE_ADDED',
		message: 'Decision note added',
		propertyId: propertyB.id,
		entityNoteId: noteRenovation.id,
	})

	const documentLease = await prisma.document.create({
		data: {
			propertyId: propertyA.id,
			documentType: 'LEASE',
			date: new Date('2024-01-01'),
			fileKey: 'lease_2024.pdf',
			notes: 'Signed lease for Alex Rivera.',
		},
	})
	await logAudit({
		entityType: 'document',
		entityId: documentLease.id,
		after: {
			id: documentLease.id,
			documentType: documentLease.documentType,
			date: documentLease.date,
			propertyId: documentLease.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'DOCUMENT_ADDED',
		message: 'Document added',
		propertyId: propertyA.id,
		documentId: documentLease.id,
	})

	const documentInsurance = await prisma.document.create({
		data: {
			propertyId: propertyA.id,
			documentType: 'INSURANCE',
			date: new Date('2024-01-05'),
			fileKey: 'insurance_2024.pdf',
			notes: 'Annual insurance policy.',
		},
	})
	await logAudit({
		entityType: 'document',
		entityId: documentInsurance.id,
		after: {
			id: documentInsurance.id,
			documentType: documentInsurance.documentType,
			date: documentInsurance.date,
			propertyId: documentInsurance.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'DOCUMENT_ADDED',
		message: 'Document added',
		propertyId: propertyA.id,
		documentId: documentInsurance.id,
	})

	const documentRoofInspection = await prisma.document.create({
		data: {
			propertyId: propertyA.id,
			documentType: 'INSPECTION',
			date: new Date('2023-03-02'),
			fileKey: 'roof_inspection_2023.pdf',
			assetId: roofSunset.id,
			notes: 'Roof inspection report.',
		},
	})
	await logAudit({
		entityType: 'document',
		entityId: documentRoofInspection.id,
		after: {
			id: documentRoofInspection.id,
			documentType: documentRoofInspection.documentType,
			date: documentRoofInspection.date,
			propertyId: documentRoofInspection.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'DOCUMENT_ADDED',
		message: 'Document added',
		propertyId: propertyA.id,
		documentId: documentRoofInspection.id,
	})

	const documentBosphorusInspection = await prisma.document.create({
		data: {
			propertyId: propertyB.id,
			documentType: 'INSPECTION',
			date: new Date('2023-01-15'),
			fileKey: 'inspection_2023.pdf',
			notes: 'Annual inspection summary.',
		},
	})
	await logAudit({
		entityType: 'document',
		entityId: documentBosphorusInspection.id,
		after: {
			id: documentBosphorusInspection.id,
			documentType: documentBosphorusInspection.documentType,
			date: documentBosphorusInspection.date,
			propertyId: documentBosphorusInspection.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'DOCUMENT_ADDED',
		message: 'Document added',
		propertyId: propertyB.id,
		documentId: documentBosphorusInspection.id,
	})

	const documentWarranty = await prisma.document.create({
		data: {
			propertyId: propertyB.id,
			documentType: 'WARRANTY',
			date: new Date('2022-06-01'),
			fileKey: 'boiler_warranty.pdf',
			notes: 'Boiler warranty coverage.',
		},
	})
	await logAudit({
		entityType: 'document',
		entityId: documentWarranty.id,
		after: {
			id: documentWarranty.id,
			documentType: documentWarranty.documentType,
			date: documentWarranty.date,
			propertyId: documentWarranty.propertyId,
		},
	})
	await logTimelineEvent({
		type: 'DOCUMENT_ADDED',
		message: 'Document added',
		propertyId: propertyB.id,
		documentId: documentWarranty.id,
	})
	console.timeEnd('🧰 Created assets, vendors, maintenance, leases, finances...')

	console.timeEnd('🌱 Database has been seeded')
}

seed()
	.then(async () => {
		await prisma.$disconnect()
	})
	.catch(async (error) => {
		console.error(error)
		await prisma.$disconnect()
		process.exit(1)
	})
