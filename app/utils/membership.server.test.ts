import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { assertMembershipPermission } from './membership.server.ts'

test('manager role allows reading properties but not deleting organizations', async () => {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: { ...userData },
	})
	const organization = await prisma.organization.create({
		select: { id: true },
		data: { name: 'RBAC Test Org' },
	})
	const managerRole = await prisma.role.findUniqueOrThrow({
		where: { name: 'manager' },
		select: { id: true },
	})
	const membership = await prisma.membership.create({
		select: {
			id: true,
			organizationId: true,
			userId: true,
			role: {
				select: {
					id: true,
					name: true,
					permissions: {
						select: { action: true, entity: true, access: true },
					},
				},
			},
		},
		data: {
			organizationId: organization.id,
			userId: user.id,
			roleId: managerRole.id,
		},
	})

	expect(() =>
		assertMembershipPermission(membership, 'read:property:any'),
	).not.toThrow()

	let error: unknown
	try {
		assertMembershipPermission(membership, 'delete:organization:any')
	} catch (caught) {
		error = caught
	}

	expect(error).toBeInstanceOf(Response)
	if (error instanceof Response) {
		expect(error.status).toBe(403)
	}
})
