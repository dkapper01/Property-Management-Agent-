import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { writeAuditLog } from './audit.server.ts'

test('writeAuditLog stores actor and before/after snapshots', async () => {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: { ...userData },
	})
	const organization = await prisma.organization.create({
		select: { id: true },
		data: { name: 'Audit Test Org' },
	})

	const audit = await writeAuditLog({
		action: 'CREATE',
		entityType: 'property',
		entityId: 'prop_test_1',
		organizationId: organization.id,
		actorId: user.id,
		before: null,
		after: { name: 'Audit Property' },
	})

	const stored = await prisma.auditLog.findUnique({
		where: { id: audit.id },
		select: {
			id: true,
			entityType: true,
			entityId: true,
			actorId: true,
			actorType: true,
			before: true,
			after: true,
		},
	})

	expect(stored).not.toBeNull()
	expect(stored?.actorId).toBe(user.id)
	expect(stored?.actorType).toBe('USER')
	expect(stored?.entityType).toBe('property')
	expect(stored?.entityId).toBe('prop_test_1')
	expect(stored?.before).toBeNull()
	expect(stored?.after).toEqual({ name: 'Audit Property' })
})
