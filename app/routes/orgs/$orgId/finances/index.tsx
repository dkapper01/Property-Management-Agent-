import { prisma } from '#app/utils/db.server.ts'
import {
	assertMembershipPermission,
	requireMembership,
} from '#app/utils/membership.server.ts'
import { cn } from '#app/utils/misc.tsx'
import { type Route } from './+types/index.ts'

const FinancialCategoryLabel: Record<string, string> = {
	RENT_INCOME: 'Rent income',
	MORTGAGE: 'Mortgage',
	INSURANCE: 'Insurance',
	MAINTENANCE: 'Maintenance',
	CAPEX: 'CapEx',
	UTILITIES: 'Utilities',
	HOA: 'HOA',
	TAXES: 'Taxes',
	OTHER: 'Other',
}

function getCategoryAccent(category: string) {
	if (category === 'RENT_INCOME') return 'bg-emerald-500'
	if (category === 'MAINTENANCE') return 'bg-amber-500'
	return 'bg-accent'
}

function getCategoryBadge(category: string) {
	if (category === 'RENT_INCOME') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
	if (category === 'MAINTENANCE') return 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
	return 'bg-accent/10 text-accent'
}

export async function loader({ params, request }: Route.LoaderArgs) {
	const organizationId = params.orgId
	if (!organizationId) {
		throw new Response('Workspace not found', { status: 404 })
	}

	const membership = await requireMembership(request, organizationId)
	assertMembershipPermission(membership, 'read:financial-entry:any')

	const organization = await prisma.organization.findUnique({
		where: { id: organizationId },
		select: { id: true, name: true },
	})
	if (!organization) {
		throw new Response('Workspace not found', { status: 404 })
	}

	const entries = await prisma.financialEntry.findMany({
		where: { organizationId },
		select: {
			id: true,
			category: true,
			amount: true,
			date: true,
			notes: true,
			property: { select: { id: true, name: true } },
			vendor: { select: { id: true, name: true } },
			maintenanceEvent: { select: { id: true, description: true } },
		},
		orderBy: { date: 'desc' },
	})

	const totalsByCategory: Record<string, number> = {}
	for (const entry of entries) {
		totalsByCategory[entry.category] =
			(totalsByCategory[entry.category] ?? 0) + entry.amount
	}

	return {
		organization,
		entries,
		totalsByCategory,
	}
}

export default function OrgFinances({ loaderData }: Route.ComponentProps) {
	const formatCurrency = (amount: number) =>
		new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			maximumFractionDigits: 2,
		}).format(amount)

	const dateFormatter = new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
	})

	return (
		<article className="mx-auto max-w-(--reading-column) px-5 py-8 md:px-8">
			<header className="mb-8">
				<p className="text-body-2xs text-muted-foreground/70 mb-2 uppercase tracking-[0.2em]">
					{loaderData.organization.name}
				</p>
				<h1 className="text-h4 font-serif tracking-tight">Finances</h1>
				<p className="text-body-2xs text-muted-foreground mt-1">
					{loaderData.entries.length} entries
				</p>
				<div className="mt-6 h-px bg-linear-to-r from-border/60 via-border/30 to-transparent" />
			</header>

			<section className="mb-12">
				<div className="mb-6 flex items-center gap-2 border-b border-border/40 pb-2">
					<span className="h-4 w-[3px] rounded-full bg-accent" />
					<h2 className="text-body-md font-semibold uppercase tracking-[0.2em] text-muted-foreground">
						By category
					</h2>
				</div>
				{Object.keys(loaderData.totalsByCategory).length ? (
					<div className="grid gap-3 sm:grid-cols-2">
						{Object.entries(loaderData.totalsByCategory).map(
							([category, total]) => (
								<div
									key={category}
									className="relative overflow-hidden rounded-xl border border-border/40 bg-card p-4 shadow-xs"
								>
									<div className={cn('absolute left-0 inset-y-0 w-[3px]', getCategoryAccent(category))} />
									<div className="flex items-center gap-2 mb-1">
										<span className={cn('size-2 rounded-full', getCategoryAccent(category))} />
										<p className="text-body-2xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/60">
											{FinancialCategoryLabel[category] ?? category}
										</p>
									</div>
									<p className="text-body-lg font-semibold text-foreground tabular-nums">
										{formatCurrency(total)}
									</p>
								</div>
							),
						)}
					</div>
				) : (
					<div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
						<p className="text-body-sm text-muted-foreground">
							No finance activity recorded yet.
						</p>
					</div>
				)}
			</section>

			<section>
				<div className="mb-6 flex items-center gap-2 border-b border-border/40 pb-2">
					<span className="h-4 w-[3px] rounded-full bg-accent" />
					<h2 className="text-body-md font-semibold uppercase tracking-[0.2em] text-muted-foreground">
						Entries
					</h2>
				</div>
				{loaderData.entries.length ? (
					<div className="space-y-3">
						{loaderData.entries.map((entry) => (
							<div
								key={entry.id}
								className="relative overflow-hidden rounded-xl border border-border/40 bg-card p-4 shadow-xs"
							>
								<div className={cn('absolute left-0 inset-y-0 w-[3px]', getCategoryAccent(entry.category))} />
								<div className="flex items-center gap-2">
									<span className={cn('size-2 shrink-0 rounded-full', getCategoryAccent(entry.category))} />
									<p className="text-body-xs text-muted-foreground">
										{dateFormatter.format(entry.date)}
									</p>
									<span className={cn('rounded-full px-1.5 py-0.5 text-body-2xs font-medium', getCategoryBadge(entry.category))}>
										{FinancialCategoryLabel[entry.category] ?? entry.category}
									</span>
								</div>
								<div className="mt-2 flex items-start justify-between gap-3">
									<div className="space-y-1">
										<p className="text-body-xs text-muted-foreground">
											[[{entry.property.name}]]
											{entry.vendor ? ` · ${entry.vendor.name}` : ''}
										</p>
										{entry.notes ? (
											<p className="text-body-xs text-muted-foreground">
												{entry.notes}
											</p>
										) : null}
									</div>
									<span className={cn(
										'text-body-sm font-semibold tabular-nums',
										entry.category === 'RENT_INCOME'
											? 'text-emerald-600 dark:text-emerald-400'
											: 'text-foreground',
									)}>
										{entry.category === 'RENT_INCOME' ? '+' : ''}{formatCurrency(entry.amount)}
									</span>
								</div>
							</div>
						))}
					</div>
				) : (
					<div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
						<p className="text-body-sm text-muted-foreground">
							No financial entries yet.
						</p>
					</div>
				)}
			</section>
		</article>
	)
}
