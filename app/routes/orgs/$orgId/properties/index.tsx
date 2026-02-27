import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { prisma } from '#app/utils/db.server.ts'
import {
	assertMembershipPermission,
	requireMembership,
} from '#app/utils/membership.server.ts'
import { roleHasPermission } from '#app/utils/user.ts'
import { type Route } from './+types/index.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
	const organizationId = params.orgId
	if (!organizationId) {
		throw new Response('Workspace not found', { status: 404 })
	}

	const membership = await requireMembership(request, organizationId)
	assertMembershipPermission(membership, 'read:property:any')

	const organization = await prisma.organization.findUnique({
		where: { id: organizationId },
		select: { id: true, name: true },
	})
	if (!organization) {
		throw new Response('Workspace not found', { status: 404 })
	}

	const properties = await prisma.property.findMany({
		where: { organizationId },
		select: {
			id: true,
			name: true,
			address: true,
			country: true,
			_count: {
				select: { maintenanceEvents: true, assets: true, documents: true },
			},
		},
		orderBy: { name: 'asc' },
	})

	return { organization, membership, properties }
}

export default function OrgProperties({ loaderData }: Route.ComponentProps) {
	const [searchQuery, setSearchQuery] = useState('')
	const canManageMembers = roleHasPermission(
		loaderData.membership.role,
		'read:membership:any',
	)
	const canCreateProperty = roleHasPermission(
		loaderData.membership.role,
		'create:property:any',
	)
	const canReadVendors = roleHasPermission(
		loaderData.membership.role,
		'read:vendor:any',
	)
	const canReadFinances = roleHasPermission(
		loaderData.membership.role,
		'read:financial-entry:any',
	)

	const filteredProperties = useMemo(() => {
		const q = searchQuery.trim().toLowerCase()
		if (!q) return loaderData.properties
		return loaderData.properties.filter((property) => {
			const address = [property.address, property.country]
				.filter(Boolean)
				.join(' ')
				.toLowerCase()
			return property.name.toLowerCase().includes(q) || address.includes(q)
		})
	}, [loaderData.properties, searchQuery])

	return (
		<article className="mx-auto max-w-(--reading-column) px-5 py-8 md:px-8">
			<header className="mb-8">
				<p className="text-body-2xs text-muted-foreground/70 mb-2 uppercase tracking-[0.2em]">
					{loaderData.organization.name}
				</p>
				<h1 className="text-h4 font-serif tracking-tight">Portfolio</h1>
				<div className="mt-3 flex flex-wrap gap-2">
					{canManageMembers ? (
						<Link
							to={`/orgs/${loaderData.organization.id}/members`}
							className="rounded-full border border-border/60 bg-card px-3 py-1 text-body-2xs text-muted-foreground hover:border-accent/40 hover:text-foreground"
						>
							Collaborators
						</Link>
					) : null}
					{canReadVendors ? (
						<Link
							to={`/orgs/${loaderData.organization.id}/vendors`}
							className="rounded-full border border-border/60 bg-card px-3 py-1 text-body-2xs text-muted-foreground hover:border-accent/40 hover:text-foreground"
						>
							Vendors
						</Link>
					) : null}
					{canReadFinances ? (
						<Link
							to={`/orgs/${loaderData.organization.id}/finances`}
							className="rounded-full border border-border/60 bg-card px-3 py-1 text-body-2xs text-muted-foreground hover:border-accent/40 hover:text-foreground"
						>
							Finances
						</Link>
					) : null}
					{canCreateProperty ? (
						<Link
							to={`/orgs/${loaderData.organization.id}/properties/new`}
							className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-body-2xs text-accent hover:bg-accent/15"
						>
							+ New property
						</Link>
					) : null}
				</div>
				<div className="mt-6 h-px bg-linear-to-r from-border/60 via-border/30 to-transparent" />
			</header>

			<div className="mb-6">
				<input
					type="search"
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					placeholder="Search properties..."
					className="border border-border/40 bg-card placeholder:text-muted-foreground/40 w-full rounded-lg px-3.5 py-2.5 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/40"
				/>
			</div>

			{filteredProperties.length ? (
				<div className="space-y-2">
					{filteredProperties.map((property) => (
						<Link
							key={property.id}
							to={`/orgs/${loaderData.organization.id}/properties/${property.id}`}
							className="flex items-center justify-between gap-4 rounded-xl border border-border/40 bg-card p-4 shadow-xs hover:shadow-sm hover:border-border/60"
						>
							<div className="min-w-0 flex items-center gap-3">
								<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-[11px] font-bold text-accent">
									{property.name[0]?.toUpperCase()}
								</span>
								<div className="min-w-0 space-y-0.5">
									<p className="text-body-sm text-foreground truncate font-medium">
										{property.name}
									</p>
									<p className="text-body-2xs text-muted-foreground truncate">
										{property.address || 'Address not set'}
									</p>
								</div>
							</div>
							<p className="text-body-2xs text-muted-foreground/60 shrink-0">
								{property._count.maintenanceEvents} events ·{' '}
								{property._count.assets} assets
							</p>
						</Link>
					))}
				</div>
			) : (
				<div className="mt-8 rounded-xl border border-dashed border-border/60 p-8 text-center">
					<p className="text-body-sm text-muted-foreground/60">
						{loaderData.properties.length
							? 'No properties match your search.'
							: 'No properties yet. Add one to start building its timeline.'}
					</p>
				</div>
			)}
		</article>
	)
}
