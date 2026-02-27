import { Outlet } from 'react-router'
import { prisma } from '#app/utils/db.server.ts'
import { requireMembership } from '#app/utils/membership.server.ts'
import { type Route } from './+types/_layout.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
	const organizationId = params.orgId
	if (!organizationId) {
		throw new Response('Workspace not found', { status: 404 })
	}

	await requireMembership(request, organizationId)

	const organization = await prisma.organization.findUnique({
		where: { id: organizationId },
		select: { id: true, name: true },
	})

	if (!organization) {
		throw new Response('Workspace not found', { status: 404 })
	}

	return { organization }
}

export default function OrgLayout() {
	return <Outlet />
}
