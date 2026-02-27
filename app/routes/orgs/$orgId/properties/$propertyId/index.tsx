import { useMemo } from 'react'
import { data, Form, Link } from 'react-router'
import { EmptyState } from '#app/components/empty-state.tsx'
import { MarkdownPreview } from '#app/components/markdown.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { prisma } from '#app/utils/db.server.ts'
import {
	assertMembershipPermission,
	requireMembership,
} from '#app/utils/membership.server.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	getPropertyTimeline,
	type TimelineEntryType,
} from '#app/utils/timeline.server.ts'
import { roleHasPermission } from '#app/utils/user.ts'
import { type Route } from './+types/index.ts'

const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' })

function formatCurrency(amount: number) {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 2,
	}).format(amount)
}

function formatLabel(value: string) {
	return value
		.replace(/_/g, ' ')
		.toLowerCase()
		.replace(/^\w/, (c) => c.toUpperCase())
}

const timelineDotColor: Record<TimelineEntryType, string> = {
	maintenance: 'bg-amber-500',
	note: 'bg-accent',
	lease: 'bg-emerald-500',
	finance: 'bg-violet-500',
	asset: 'bg-accent',
	document: 'bg-foreground/30',
	event: 'bg-foreground/30',
	change: 'bg-foreground/30',
}

const timelineBadgeStyle: Record<TimelineEntryType, string> = {
	maintenance: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
	note: 'bg-accent/10 text-accent',
	lease: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
	finance: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
	asset: 'bg-accent/10 text-accent',
	document: 'bg-muted text-muted-foreground',
	event: 'bg-muted text-muted-foreground',
	change: 'bg-muted text-muted-foreground',
}

const timelineLeftBorder: Record<TimelineEntryType, string> = {
	maintenance: 'border-l-2 border-l-amber-500/40',
	note: 'border-l-2 border-l-accent/40',
	lease: 'border-l-2 border-l-emerald-500/40',
	finance: 'border-l-2 border-l-violet-500/40',
	asset: 'border-l-2 border-l-accent/30',
	document: '',
	event: '',
	change: '',
}

export async function loader({ params, request }: Route.LoaderArgs) {
	const organizationId = params.orgId
	const propertyId = params.propertyId
	if (!organizationId || !propertyId) {
		throw new Response('Property not found', { status: 404 })
	}

	const membership = await requireMembership(request, organizationId)
	assertMembershipPermission(membership, 'read:property:any')

	const property = await prisma.property.findFirst({
		where: { id: propertyId, organizationId },
		select: {
			id: true,
			name: true,
			address: true,
			country: true,
			purchaseDate: true,
			purchasePrice: true,
			ownershipType: true,
			status: true,
			notes: true,
			organization: { select: { id: true, name: true } },
			_count: {
				select: {
					maintenanceEvents: true,
					leases: true,
					assets: true,
					documents: true,
					financialEntries: true,
				},
			},
		},
	})

	if (!property) {
		throw new Response('Property not found', { status: 404 })
	}

	const canReadAuditLogs = roleHasPermission(
		membership.role,
		'read:audit-log:any',
	)

	const timeline = await getPropertyTimeline({
		organizationId,
		propertyId,
		includeAuditLogs: canReadAuditLogs,
	})

	const canReviewDrafts = roleHasPermission(
		membership.role,
		'update:draft-change:any',
	)

	const maintenanceIds = canReviewDrafts
		? timeline
				.filter(
					(entry) => entry.type === 'maintenance' && entry.entityId,
				)
				.map((entry) => entry.entityId as string)
		: []

	const maintenanceDrafts =
		canReviewDrafts && maintenanceIds.length
			? await prisma.draftChange.findMany({
					where: {
						organizationId,
						status: 'DRAFT',
						entityType: 'maintenance-event',
						entityId: { in: maintenanceIds },
					},
					select: {
						id: true,
						entityId: true,
						title: true,
						summary: true,
						createdAt: true,
						proposedByLabel: true,
						proposedByType: true,
						proposedBy: {
							select: { id: true, name: true, username: true },
						},
					},
					orderBy: { createdAt: 'desc' },
				})
			: []

	return data({
		property,
		organizationId,
		membership,
		timeline,
		maintenanceDrafts,
	})
}

export default function PropertyDetail({ loaderData }: Route.ComponentProps) {
	const { property } = loaderData

	const canCreateNote = roleHasPermission(
		loaderData.membership.role,
		'create:entity-note:any',
	)
	const canCreateMaintenance = roleHasPermission(
		loaderData.membership.role,
		'create:maintenance-event:any',
	)
	const canCreateLease = roleHasPermission(
		loaderData.membership.role,
		'create:lease:any',
	)
	const canReviewDrafts = roleHasPermission(
		loaderData.membership.role,
		'update:draft-change:any',
	)

	const propertyBase = `/orgs/${loaderData.organizationId}/properties/${property.id}`
	const timelineEntries = loaderData.timeline
	const maintenanceDrafts = loaderData.maintenanceDrafts

	const timelineBuckets = useMemo(() => {
		const buckets = {
			note: [] as typeof timelineEntries,
			maintenance: [] as typeof timelineEntries,
			asset: [] as typeof timelineEntries,
			lease: [] as typeof timelineEntries,
			document: [] as typeof timelineEntries,
			finance: [] as typeof timelineEntries,
		}
		for (const entry of timelineEntries) {
			if (entry.type === 'note') buckets.note.push(entry)
			if (entry.type === 'maintenance') buckets.maintenance.push(entry)
			if (entry.type === 'asset') buckets.asset.push(entry)
			if (entry.type === 'lease') buckets.lease.push(entry)
			if (entry.type === 'document') buckets.document.push(entry)
			if (entry.type === 'finance') buckets.finance.push(entry)
		}
		return buckets
	}, [timelineEntries])

	const maintenanceDraftsById = useMemo(() => {
		const byId: Record<
			string,
			(typeof maintenanceDrafts)[number]
		> = {}
		for (const draft of maintenanceDrafts) {
			if (!draft.entityId) continue
			if (!byId[draft.entityId]) byId[draft.entityId] = draft
		}
		return byId
	}, [maintenanceDrafts])

	const stats = [
		{ label: 'Assets', value: property._count.assets, color: 'bg-accent' },
		{ label: 'Maintenance', value: property._count.maintenanceEvents, color: 'bg-amber-500' },
		{ label: 'Leases', value: property._count.leases, color: 'bg-emerald-500' },
		{ label: 'Documents', value: property._count.documents, color: 'bg-accent' },
		{ label: 'Finances', value: property._count.financialEntries, color: 'bg-violet-500' },
	]

	return (
		<article className="mx-auto max-w-(--reading-column) px-6 py-10 md:px-8">
			{/* ── Header ── */}
			<Link
				to={`/orgs/${loaderData.organizationId}/properties`}
				className="text-body-2xs text-muted-foreground hover:text-foreground"
			>
				← Back to portfolio
			</Link>

			<header className="mt-6">
				<p className="text-body-2xs text-muted-foreground/70 uppercase tracking-[0.2em]">
					Property
				</p>
				<h1 className="text-h3 font-serif tracking-tight mt-2">
					{property.name}
				</h1>

				<div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-xs text-muted-foreground">
					<span>{property.address || 'Address not set'}</span>
					{property.country ? (
						<>
							<span className="text-border">·</span>
							<span>{property.country}</span>
						</>
					) : null}
					<span className="text-border">·</span>
					<span>{formatLabel(property.status)}</span>
					<span className="text-border">·</span>
					<span>{formatLabel(property.ownershipType)}</span>
					{property.purchasePrice ? (
						<>
							<span className="text-border">·</span>
							<span>{formatCurrency(property.purchasePrice)}</span>
						</>
					) : null}
				</div>

				{/* Stat cards */}
				<div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-5">
					{stats.map((stat) => (
						<div
							key={stat.label}
							className="relative overflow-hidden rounded-xl border border-border/40 bg-card px-4 py-3 shadow-xs"
						>
							<div className={cn('absolute inset-x-0 top-0 h-[2px]', stat.color)} />
							<p className="text-body-2xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">
								{stat.label}
							</p>
							<p className="mt-1 text-body-md font-semibold tabular-nums text-foreground">
								{stat.value}
							</p>
						</div>
					))}
				</div>

				{/* Action pills */}
				<div className="mt-4 flex flex-wrap gap-2">
					{canCreateNote ? (
						<Link
							to={`${propertyBase}/notes/new`}
							className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-body-2xs text-accent hover:bg-accent/15"
						>
							+ Add note
						</Link>
					) : null}
					{canCreateMaintenance ? (
						<Link
							to={`${propertyBase}/maintenance/new`}
							className="rounded-full border border-border/60 bg-card px-3 py-1 text-body-2xs text-muted-foreground hover:border-accent/40 hover:text-foreground"
						>
							Log maintenance
						</Link>
					) : null}
					{canCreateLease ? (
						<Link
							to={`${propertyBase}/leases/new`}
							className="rounded-full border border-border/60 bg-card px-3 py-1 text-body-2xs text-muted-foreground hover:border-accent/40 hover:text-foreground"
						>
							Create lease
						</Link>
					) : null}
				</div>

				<div className="mt-6 h-px bg-linear-to-r from-border/60 via-border/30 to-transparent" />
			</header>

			{/* ── Property sections ── */}
			<div className="mt-10 space-y-14">
				<section id="timeline" className="scroll-mt-24">
					<TimelinePanel timeline={loaderData.timeline} />
				</section>

				<section id="notes" className="scroll-mt-24">
					<NotesPanel
						notes={property.notes}
						entries={timelineBuckets.note}
						propertyBase={propertyBase}
						canCreateNote={canCreateNote}
					/>
				</section>

				<section id="finances" className="scroll-mt-24">
					<FilteredPanel
						entries={timelineBuckets.finance}
						type="finance"
						emptyTitle="No financial entries"
						emptyDescription="Financial entries will appear here as you record income and expenses."
						emptyIcon="dots-horizontal"
					/>
				</section>

				<section id="documents" className="scroll-mt-24">
					<FilteredPanel
						entries={timelineBuckets.document}
						type="document"
						emptyTitle="No documents yet"
						emptyDescription="Property documents will appear here once uploaded."
						emptyIcon="file-text"
					/>
				</section>

				<section id="maintenance" className="scroll-mt-24">
					<FilteredPanel
						entries={timelineBuckets.maintenance}
						type="maintenance"
						draftsByEntityId={maintenanceDraftsById}
						canReviewDrafts={canReviewDrafts}
						organizationId={loaderData.organizationId}
						draftRedirectTo={`${propertyBase}#maintenance`}
						emptyTitle="No maintenance events"
						emptyDescription="Log your first maintenance event to start tracking."
						emptyIcon="update"
						actionLabel={canCreateMaintenance ? 'Log maintenance' : undefined}
						actionTo={
							canCreateMaintenance
								? `${propertyBase}/maintenance/new`
								: undefined
						}
					/>
				</section>

				<section id="assets" className="scroll-mt-24">
					<FilteredPanel
						entries={timelineBuckets.asset}
						type="asset"
						emptyTitle="No assets tracked"
						emptyDescription="Add assets to track their lifecycle and maintenance."
						emptyIcon="link-2"
					/>
				</section>

				<section id="leases" className="scroll-mt-24">
					<FilteredPanel
						entries={timelineBuckets.lease}
						type="lease"
						emptyTitle="No leases"
						emptyDescription="Create a lease to start tracking occupancy."
						emptyIcon="avatar"
						actionLabel={canCreateLease ? 'Create lease' : undefined}
						actionTo={
							canCreateLease ? `${propertyBase}/leases/new` : undefined
						}
					/>
				</section>
			</div>
		</article>
	)
}

/* ── Notes panel ── */

function NotesPanel({
	notes,
	entries,
	propertyBase,
	canCreateNote,
}: {
	notes: string | null
	entries: {
		id: string
		type: string
		occurredAt: Date
		title: string
		description?: string | null
		entityId?: string | null
	}[]
	propertyBase: string
	canCreateNote: boolean
}) {
	const hasPropertyNotes = Boolean(notes?.trim())
	const hasEntries = entries.length > 0

	return (
		<section>
			<div className="mb-4 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span className="h-4 w-[3px] rounded-full bg-accent" />
					<h2 className="text-body-md font-semibold uppercase tracking-[0.2em] text-muted-foreground">
						Notes
					</h2>
				</div>
				{canCreateNote ? (
					<Link
						to={`${propertyBase}/notes/new`}
						className="text-body-2xs text-accent hover:underline"
					>
						Add note
					</Link>
				) : null}
			</div>

			{hasPropertyNotes ? (
				<div className="rounded-xl border border-border/40 bg-card p-5 shadow-xs">
					<p className="text-body-2xs uppercase tracking-[0.2em] text-muted-foreground">
						Property notes
					</p>
					<div className="mt-3 text-body-sm leading-relaxed">
						<MarkdownPreview content={notes ?? ''} />
					</div>
				</div>
			) : null}

			{hasEntries ? (
				<div className={cn('space-y-3', hasPropertyNotes && 'mt-4')}>
					{entries.map((entry) => (
						<TimelineCard key={entry.id} entry={entry} />
					))}
				</div>
			) : !hasPropertyNotes ? (
				<EmptyState
					icon="file-text"
					title="No notes yet"
					description="Notes added to the property or linked entities will appear here."
					actionLabel={canCreateNote ? 'Add note' : undefined}
					actionTo={canCreateNote ? `${propertyBase}/notes/new` : undefined}
				/>
			) : null}
		</section>
	)
}

/* ── Timeline panel ── */

function TimelinePanel({
	timeline,
}: {
	timeline: {
		id: string
		type: string
		occurredAt: Date
		title: string
		description?: string | null
		metadata?: Record<string, unknown> | null
		actor?: { name: string | null; username: string | null } | null
		entityId?: string | null
	}[]
}) {
	return (
		<section>
			<div className="mb-4 flex items-center gap-2">
				<span className="h-4 w-[3px] rounded-full bg-accent" />
				<h2 className="text-body-md font-semibold uppercase tracking-[0.2em] text-muted-foreground">
					Timeline
				</h2>
				<span className="ml-auto text-body-2xs text-muted-foreground tabular-nums">
					{timeline.length} entries
				</span>
			</div>

			{timeline.length ? (
				<div className="space-y-3">
					{timeline.map((entry) => (
						<TimelineCard key={entry.id} entry={entry} />
					))}
				</div>
			) : (
				<EmptyState
					icon="clock"
					title="No timeline activity yet"
					description="Activity across the property will appear here chronologically."
				/>
			)}
		</section>
	)
}

/* ── Filtered panel (maintenance, assets, leases) ── */

function FilteredPanel({
	entries,
	type,
	draftsByEntityId,
	canReviewDrafts,
	organizationId,
	draftRedirectTo,
	emptyTitle,
	emptyDescription,
	emptyIcon,
	actionLabel,
	actionTo,
}: {
	entries: {
		id: string
		type: string
		occurredAt: Date
		title: string
		description?: string | null
		metadata?: Record<string, unknown> | null
		entityId?: string | null
	}[]
	type: string
	draftsByEntityId?: Record<
		string,
		{
			id: string
			entityId: string | null
			title: string
			summary: string | null
			createdAt: Date
			proposedByLabel: string | null
			proposedByType: string | null
			proposedBy: { id: string; name: string | null; username: string | null } | null
		}
	>
	canReviewDrafts?: boolean
	organizationId?: string
	draftRedirectTo?: string
	emptyTitle: string
	emptyDescription: string
	emptyIcon:
		| 'update'
		| 'link-2'
		| 'avatar'
		| 'clock'
		| 'file-text'
		| 'dots-horizontal'
	actionLabel?: string
	actionTo?: string
}) {
	const typeLabel =
		type === 'maintenance'
			? 'Maintenance'
			: type === 'asset'
				? 'Assets'
				: type === 'lease'
					? 'Leases'
					: type === 'document'
						? 'Documents'
						: type === 'finance'
							? 'Financials'
							: type

	const sectionBarColor =
		type === 'maintenance'
			? 'bg-amber-500'
			: type === 'lease'
				? 'bg-emerald-500'
				: type === 'finance'
					? 'bg-violet-500'
					: 'bg-accent'

	const canShowDraftActions =
		type === 'maintenance' &&
		Boolean(draftsByEntityId) &&
		Boolean(canReviewDrafts) &&
		Boolean(organizationId)

	return (
		<section>
			<div className="mb-4 flex items-center gap-2">
				<span className={cn('h-4 w-[3px] rounded-full', sectionBarColor)} />
				<h2 className="text-body-md font-semibold uppercase tracking-[0.2em] text-muted-foreground">
					{typeLabel}
				</h2>
				<span className="ml-auto text-body-2xs text-muted-foreground tabular-nums">
					{entries.length} entries
				</span>
			</div>

			{entries.length ? (
				<div className="space-y-3">
					{entries.map((entry) => {
						const draft =
							canShowDraftActions && entry.entityId
								? draftsByEntityId?.[entry.entityId]
								: undefined
						return (
							<TimelineCard
								key={entry.id}
								entry={entry}
								showMetadata
								draftAction={
									draft && organizationId
										? {
												draftId: draft.id,
												title: draft.title,
												summary: draft.summary,
												organizationId,
												redirectTo: draftRedirectTo,
											}
										: undefined
								}
							/>
						)
					})}
				</div>
			) : (
				<EmptyState
					icon={emptyIcon}
					title={emptyTitle}
					description={emptyDescription}
					actionLabel={actionLabel}
					actionTo={actionTo}
				/>
			)}
		</section>
	)
}

/* ── Timeline card ── */

function TimelineCard({
	entry,
	showMetadata = false,
	draftAction,
}: {
	entry: {
		id: string
		type: string
		occurredAt: Date
		title: string
		description?: string | null
		metadata?: Record<string, unknown> | null
		actor?: { name: string | null; username: string | null } | null
		entityId?: string | null
	}
	showMetadata?: boolean
	draftAction?: {
		draftId: string
		title: string
		summary: string | null
		organizationId: string
		redirectTo?: string
	}
}) {
	const dotColor =
		timelineDotColor[entry.type as TimelineEntryType] ?? 'bg-foreground/30'
	const badgeStyle =
		timelineBadgeStyle[entry.type as TimelineEntryType] ?? 'bg-muted text-muted-foreground'
	const leftBorder =
		timelineLeftBorder[entry.type as TimelineEntryType] ?? ''

	const meta = entry.metadata
	const severity = meta?.severity as string | undefined
	const status = meta?.status as string | undefined
	const amount = meta?.amount as number | undefined
	const category = meta?.category as string | undefined
	const vendorName = meta?.vendorName as string | undefined

	return (
		<div className={cn('rounded-xl border border-border/40 bg-card px-5 py-4 shadow-xs', leftBorder)}>
			<div className="flex items-center gap-2 text-body-xs text-muted-foreground">
				<span
					className={cn(
						'size-2.5 shrink-0 rounded-full ring-2 ring-background',
						dotColor,
					)}
				/>
				<span>{dateFormatter.format(entry.occurredAt)}</span>
				{entry.actor ? (
					<>
						<span className="text-border">·</span>
						<span>{entry.actor.name ?? entry.actor.username}</span>
					</>
				) : null}
				<span className={cn('ml-auto rounded-full px-2 py-0.5 text-body-2xs font-medium capitalize', badgeStyle)}>
					{entry.type.replace(/_/g, ' ')}
				</span>
			</div>
			<p className="mt-2 text-body-sm font-medium leading-snug">{entry.title}</p>
			{entry.description ? (
				<p className="mt-1 text-body-xs leading-relaxed text-muted-foreground line-clamp-2">
					{entry.description}
				</p>
			) : null}

			{showMetadata && meta ? (
				<div className="mt-3 flex flex-wrap gap-2">
					{severity ? (
						<span className={cn(
							'rounded-full px-2 py-0.5 text-body-2xs font-medium',
							severity === 'critical' || severity === 'high'
								? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
								: 'bg-muted text-muted-foreground',
						)}>
							{formatLabel(severity)}
						</span>
					) : null}
					{status ? (
						<span className={cn(
							'rounded-full px-2 py-0.5 text-body-2xs font-medium',
							status === 'completed' || status === 'resolved'
								? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
								: 'bg-muted text-muted-foreground',
						)}>
							{formatLabel(status)}
						</span>
					) : null}
					{category ? (
						<span className="rounded-full bg-muted px-2 py-0.5 text-body-2xs font-medium text-muted-foreground">
							{formatLabel(category)}
						</span>
					) : null}
					{amount != null ? (
						<span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-body-2xs font-medium tabular-nums text-violet-600 dark:text-violet-400">
							{formatCurrency(amount)}
						</span>
					) : null}
					{vendorName ? (
						<span className="rounded-full bg-accent/10 px-2 py-0.5 text-body-2xs text-accent">
							[[{vendorName}]]
						</span>
					) : null}
				</div>
			) : null}

			{draftAction ? (
				<div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-body-2xs">
					<div className="text-muted-foreground">
						Draft ready{draftAction.summary ? `: ${draftAction.summary}` : ''}
					</div>
					<div className="flex flex-wrap items-center gap-3">
						<Link
							to={`/orgs/${draftAction.organizationId}/drafts/${draftAction.draftId}`}
							className="text-body-2xs font-medium text-accent hover:underline"
						>
							Review draft →
						</Link>
						<Form
							method="post"
							action={`/orgs/${draftAction.organizationId}/drafts`}
							className="shrink-0"
						>
							<input type="hidden" name="intent" value="approve" />
							<input type="hidden" name="draftId" value={draftAction.draftId} />
							{draftAction.redirectTo ? (
								<input
									type="hidden"
									name="redirectTo"
									value={draftAction.redirectTo}
								/>
							) : null}
							<StatusButton
								type="submit"
								size="sm"
								status="idle"
								className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
							>
								Approve draft
							</StatusButton>
						</Form>
					</div>
				</div>
			) : null}
		</div>
	)
}
