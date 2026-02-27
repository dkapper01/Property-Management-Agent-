import { prisma } from '#app/utils/db.server.ts'
import {
	assertMembershipPermission,
	requireMembership,
} from '#app/utils/membership.server.ts'
import { roleHasPermission } from '#app/utils/user.ts'
import { type Route } from './+types/$vendorId.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
	const { orgId: organizationId, vendorId } = params
	if (!organizationId || !vendorId) {
		throw new Response('Vendor not found', { status: 404 })
	}

	const membership = await requireMembership(request, organizationId)
	assertMembershipPermission(membership, 'read:vendor:any')

	const vendor = await prisma.vendor.findFirst({
		where: { id: vendorId, organizationId },
		select: {
			id: true,
			name: true,
			category: true,
			phone: true,
			email: true,
			website: true,
			notes: true,
		},
	})
	if (!vendor) throw new Response('Vendor not found', { status: 404 })

	const canReadMaintenance = roleHasPermission(
		membership.role,
		'read:maintenance-event:any',
	)
	const canReadFinancialEntries = roleHasPermission(
		membership.role,
		'read:financial-entry:any',
	)

	const maintenanceEvents = canReadMaintenance
		? await prisma.maintenanceEvent.findMany({
				where: { vendorId },
				select: {
					id: true,
					description: true,
					dateReported: true,
					status: true,
					property: { select: { id: true, name: true } },
				},
				orderBy: { dateReported: 'desc' },
			})
		: []

	const financialEntries = canReadFinancialEntries
		? await prisma.financialEntry.findMany({
				where: { vendorId },
				select: {
					id: true,
					category: true,
					amount: true,
					date: true,
					property: { select: { id: true, name: true } },
				},
				orderBy: { date: 'desc' },
			})
		: []

	const totalSpend = financialEntries.reduce((sum, entry) => sum + entry.amount, 0)

	return {
		vendor,
		maintenanceEvents,
		financialEntries,
		canReadMaintenance,
		canReadFinancialEntries,
		totalSpend,
		organizationId,
	}
}

export default function VendorDetail({ loaderData }: Route.ComponentProps) {
	const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' })
	const formatCurrency = (amount: number) =>
		new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			maximumFractionDigits: 2,
		}).format(amount)

	return (
		<article className="mx-auto max-w-(--reading-column) px-5 py-8 md:px-8">
			<header className="mb-12">
				<p className="text-body-2xs text-muted-foreground/70 mb-2 uppercase tracking-[0.2em]">
					Vendor
				</p>
				<h1 className="text-h4 font-serif tracking-tight">
					{loaderData.vendor.name}
				</h1>
				<div className="mt-2 space-y-0.5 text-body-2xs text-muted-foreground">
					{loaderData.vendor.category ? (
						<p>Category: {loaderData.vendor.category}</p>
					) : null}
					{loaderData.vendor.phone ? <p>Phone: {loaderData.vendor.phone}</p> : null}
					{loaderData.vendor.email ? <p>Email: {loaderData.vendor.email}</p> : null}
					{loaderData.vendor.website ? <p>Website: {loaderData.vendor.website}</p> : null}
				</div>
			</header>

			<section className="mb-12">
				<div className="mb-6 border-b border-border/40 pb-2">
					<h2 className="text-body-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
						Overview
					</h2>
				</div>
				<div className="grid gap-4 md:grid-cols-3">
					<div className="rounded-xl border border-border/40 bg-card p-4 shadow-xs">
						<p className="text-body-2xs text-muted-foreground">Maintenance events</p>
						<p className="text-body-lg font-semibold">
							{loaderData.maintenanceEvents.length}
						</p>
					</div>
					<div className="rounded-xl border border-border/40 bg-card p-4 shadow-xs">
						<p className="text-body-2xs text-muted-foreground">Financial entries</p>
						<p className="text-body-lg font-semibold">
							{loaderData.financialEntries.length}
						</p>
					</div>
					<div className="rounded-xl border border-border/40 bg-card p-4 shadow-xs">
						<p className="text-body-2xs text-muted-foreground">Total spend</p>
						<p className="text-body-lg font-semibold">
							{formatCurrency(loaderData.totalSpend)}
						</p>
					</div>
				</div>
			</section>

			{loaderData.canReadMaintenance ? (
				<section className="mb-12">
					<div className="mb-6 border-b border-border/40 pb-2">
						<h2 className="text-body-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
							Maintenance events
						</h2>
					</div>
					{loaderData.maintenanceEvents.length ? (
						<div className="space-y-3">
							{loaderData.maintenanceEvents.map((event) => (
								<div
									key={event.id}
									className="rounded-xl border border-border/40 bg-card p-4 shadow-xs"
								>
									<p className="text-body-xs text-muted-foreground">
										{dateFormatter.format(event.dateReported)}
									</p>
									<p className="text-body-sm font-medium mt-1">
										{event.description}
									</p>
									<p className="text-body-xs text-muted-foreground mt-1">
										[[{event.property.name}]] · {event.status.toLowerCase()}
									</p>
								</div>
							))}
						</div>
					) : (
						<p className="text-body-sm text-muted-foreground">
							No maintenance events linked.
						</p>
					)}
				</section>
			) : null}

			{loaderData.canReadFinancialEntries ? (
				<section>
					<div className="mb-6 border-b border-border/40 pb-2">
						<h2 className="text-body-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
							Financial entries
						</h2>
					</div>
					{loaderData.financialEntries.length ? (
						<div className="space-y-3">
							{loaderData.financialEntries.map((entry) => (
								<div
									key={entry.id}
									className="rounded-xl border border-border/40 bg-card p-4 shadow-xs"
								>
									<p className="text-body-xs text-muted-foreground">
										{dateFormatter.format(entry.date)}
									</p>
									<p className="text-body-sm font-medium mt-1">
										{entry.category}
									</p>
									<p className="text-body-xs text-muted-foreground mt-1">
										[[{entry.property.name}]]
									</p>
									<p className="text-body-sm font-semibold mt-2">
										{formatCurrency(entry.amount)}
									</p>
								</div>
							))}
						</div>
					) : (
						<p className="text-body-sm text-muted-foreground">
							No financial entries linked.
						</p>
					)}
				</section>
			) : null}
		</article>
	)
}
