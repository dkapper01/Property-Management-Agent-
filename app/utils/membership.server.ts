import { type Prisma } from '@prisma/client'
import { data } from 'react-router'
import { requireUserId } from './auth.server.ts'
import { prisma } from './db.server.ts'
import { parsePermissionString, type PermissionString } from './user.ts'

const membershipSelect = {
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
} satisfies Prisma.MembershipSelect

export type MembershipWithRole = Prisma.MembershipGetPayload<{
	select: typeof membershipSelect
}>

export async function requireMembership(
	request: Request,
	organizationId: string,
) {
	const userId = await requireUserId(request)
	const membership = await prisma.membership.findFirst({
		where: { organizationId, userId },
		select: membershipSelect,
	})
	if (!membership) {
		throw data(
			{
				error: 'Unauthorized',
				message: 'Membership required for this organization',
			},
			{ status: 403 },
		)
	}
	return membership
}

export async function requireMembershipForUser(
	organizationId: string,
	userId: string,
) {
	const membership = await prisma.membership.findFirst({
		where: { organizationId, userId },
		select: membershipSelect,
	})
	if (!membership) {
		throw data(
			{
				error: 'Unauthorized',
				message: 'Membership required for this organization',
			},
			{ status: 403 },
		)
	}
	return membership
}

export function membershipHasPermission(
	membership: MembershipWithRole,
	permission: PermissionString,
) {
	const { action, entity, access } = parsePermissionString(permission)
	return membership.role.permissions.some(
		(rolePermission) =>
			rolePermission.entity === entity &&
			rolePermission.action === action &&
			(!access || access.includes(rolePermission.access)),
	)
}

export function assertMembershipPermission(
	membership: MembershipWithRole,
	permission: PermissionString,
) {
	if (membershipHasPermission(membership, permission)) return
	const permissionData = parsePermissionString(permission)
	throw data(
		{
			error: 'Unauthorized',
			requiredPermission: permissionData,
			message: `Unauthorized: required permissions: ${permission}`,
		},
		{ status: 403 },
	)
}

export async function requireMembershipWithPermission(
	request: Request,
	organizationId: string,
	permission: PermissionString,
) {
	const membership = await requireMembership(request, organizationId)
	assertMembershipPermission(membership, permission)
	return membership
}
