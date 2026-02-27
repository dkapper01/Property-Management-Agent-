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
	assertMembershipPermission(membership, 'read:vendor:any')

	const organization = await prisma.organization.findUnique({
		where: { id: organizationId },
		select: { id: true, name: true },
	})
	if (!organization) {
		throw new Response('Workspace not found', { status: 404 })
	}

	const vendors = await prisma.vendor.findMany({
		where: { organizationId },
		select: {
			id: true,
			name: true,
			category: true,
			phone: true,
			email: true,
			website: true,
			notes: true,
		},
		orderBy: { name: 'asc' },
	})

	const canCreateVendor = roleHasPermission(
		membership.role,
		'create:vendor:any',
	)

	return { organization, vendors, canCreateVendor }
}

export default function VendorIndex({ loaderData }: Route.ComponentProps) {
	return (
		<article className="mx-auto max-w-(--reading-column) px-5 py-8 md:px-8">
			<header className="mb-8">
				<p className="text-body-2xs text-muted-foreground/70 mb-2 uppercase tracking-[0.2em]">
					{loaderData.organization.name}
				</p>
				<h1 className="text-h4 font-serif tracking-tight">Vendors</h1>
				<p className="text-body-2xs text-muted-foreground mt-1">
					{loaderData.vendors.length} vendors
				</p>
				{loaderData.canCreateVendor ? (
					<div className="mt-3">
						<Link
							to={`/orgs/${loaderData.organization.id}/vendors/new`}
							className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-body-2xs text-accent hover:bg-accent/15"
						>
							+ Add vendor
						</Link>
					</div>
				) : null}
				<div className="mt-6 h-px bg-linear-to-r from-border/60 via-border/30 to-transparent" />
			</header>

			{loaderData.vendors.length ? (
				<div className="space-y-3">
					{loaderData.vendors.map((vendor) => (
						<Link
							key={vendor.id}
							to={`/orgs/${loaderData.organization.id}/vendors/${vendor.id}`}
							className="flex items-center gap-3 rounded-xl border border-border/40 bg-card p-5 shadow-xs hover:border-border/60 hover:shadow-sm"
						>
							<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-[11px] font-bold text-accent">
								{vendor.name[0]?.toUpperCase()}
							</span>
							<div className="min-w-0">
								<p className="text-body-sm font-medium truncate">{vendor.name}</p>
								<p className="text-body-2xs text-muted-foreground truncate">
									{vendor.category ?? 'Vendor'}
									{vendor.email ? ` · ${vendor.email}` : ''}
								</p>
							</div>
						</Link>
					))}
				</div>
			) : (
				<div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
					<p className="text-body-sm text-muted-foreground/60">
						No vendors yet.
					</p>
				</div>
			)}
		</article>
	)
}
