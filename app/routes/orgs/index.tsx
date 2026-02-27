import { Link } from 'react-router'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const memberships = await prisma.membership.findMany({
		where: { userId },
		select: {
			id: true,
			role: { select: { name: true } },
			organization: {
				select: {
					id: true,
					name: true,
					_count: { select: { properties: true, memberships: true } },
				},
			},
		},
		orderBy: { organization: { name: 'asc' } },
	})

	return { memberships }
}

export default function OrgsIndex({ loaderData }: Route.ComponentProps) {
	return (
		<div className="mx-auto max-w-(--reading-column) px-6 py-10 md:px-8">
			<div className="flex items-center justify-between">
				<h1 className="text-h4 font-serif tracking-tight">Workspaces</h1>
				<Link
					to="/orgs/new"
					className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-body-2xs text-accent hover:bg-accent/15"
				>
					+ New workspace
				</Link>
			</div>
			<div className="mt-4 h-px bg-linear-to-r from-border/60 via-border/30 to-transparent" />

			{loaderData.memberships.length ? (
				<ul className="mt-6 space-y-2">
					{loaderData.memberships.map((membership) => (
						<li key={membership.id}>
							<Link
								to={`/orgs/${membership.organization.id}/properties`}
								className="flex items-center gap-3 rounded-xl border border-border/40 bg-card p-4 shadow-xs hover:shadow-sm hover:border-border/60"
							>
								<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-sm font-bold text-accent">
									{membership.organization.name[0]?.toUpperCase()}
								</span>
								<div className="grid gap-0.5">
									<p className="text-body-sm text-foreground font-medium">
										{membership.organization.name}
									</p>
									<p className="text-body-2xs text-muted-foreground">
										{membership.role.name.replace('_', ' ')} ·{' '}
										{membership.organization._count.properties} properties ·{' '}
										{membership.organization._count.memberships} collaborators
									</p>
								</div>
							</Link>
						</li>
					))}
				</ul>
			) : (
				<div className="mt-6 rounded-xl border border-dashed border-border/60 p-8 text-center">
					<p className="text-foreground font-semibold">No workspaces yet</p>
					<p className="mt-1 text-body-sm text-muted-foreground">
						Create a workspace to start managing properties.
					</p>
				</div>
			)}
		</div>
	)
}
