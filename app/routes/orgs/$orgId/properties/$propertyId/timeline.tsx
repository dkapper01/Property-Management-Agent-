import { data } from 'react-router'
import { z } from 'zod'
import {
	assertMembershipPermission,
	membershipHasPermission,
	requireMembership,
} from '#app/utils/membership.server.ts'
import { getPropertyTimeline } from '#app/utils/timeline.server.ts'
import { type Route } from './+types/timeline.ts'

const ParamsSchema = z.object({
	orgId: z.string().min(1),
	propertyId: z.string().min(1),
})

export async function loader({ params, request }: Route.LoaderArgs) {
	const { orgId, propertyId } = ParamsSchema.parse(params)
	const membership = await requireMembership(request, orgId)
	assertMembershipPermission(membership, 'read:timeline-event:any')
	const includeAuditLogs = membershipHasPermission(
		membership,
		'read:audit-log:any',
	)

	const timeline = await getPropertyTimeline({
		organizationId: orgId,
		propertyId,
		includeAuditLogs,
	})

	return data({ timeline })
}
