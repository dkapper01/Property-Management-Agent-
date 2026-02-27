import { parseWithZod } from '@conform-to/zod'
import { data, Form, Link } from 'react-router'
import { z } from 'zod'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	applyDraftChange,
	DraftOperationSchema,
	rejectDraftChange,
} from '#app/utils/draft-change.server.ts'
import { diffAuditValues } from '#app/utils/audit-diff.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	assertMembershipPermission,
	requireMembership,
} from '#app/utils/membership.server.ts'
import { cn, useIsPending } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { roleHasPermission } from '#app/utils/user.ts'
import { type Route } from './+types/$draftId.ts'

const draftStatusStyle: Record<string, string> = {
	DRAFT: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
	APPROVED: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
	APPLIED: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
	REJECTED: 'bg-muted text-muted-foreground',
}

const DraftActionSchema = z.discriminatedUnion('intent', [
	z.object({
		intent: z.literal('approve'),
		draftId: z.string().min(1),
	}),
	z.object({
		intent: z.literal('reject'),
		draftId: z.string().min(1),
		reason: z.string().optional(),
	}),
])

export async function loader({ params, request }: Route.LoaderArgs) {
	const organizationId = params.orgId
	const draftId = params.draftId
	if (!organizationId || !draftId) {
		throw new Response('Draft not found', { status: 404 })
	}

	const membership = await requireMembership(request, organizationId)
	assertMembershipPermission(membership, 'read:draft-change:any')

	const draft = await prisma.draftChange.findFirst({
		where: { id: draftId, organizationId },
		select: {
			id: true,
			title: true,
			summary: true,
			status: true,
			entityType: true,
			entityId: true,
			operations: true,
			createdAt: true,
			reviewedAt: true,
			appliedAt: true,
			proposedByType: true,
			proposedByLabel: true,
			reasoningSummary: true,
			confidence: true,
			createdBy: { select: { id: true, name: true, username: true } },
			proposedBy: { select: { id: true, name: true, username: true } },
		},
	})

	if (!draft) {
		throw new Response('Draft not found', { status: 404 })
	}

	const operations = z.array(DraftOperationSchema).parse(draft.operations)

	async function resolveTimelinePropertyId() {
		if (draft.entityId && draft.entityType === 'property') {
			return draft.entityId
		}

		for (const operation of operations) {
			const data = operation.data as Record<string, unknown>
			const propertyId = data.propertyId
			if (typeof propertyId === 'string' && propertyId.length > 0) {
				return propertyId
			}

			if (operation.entityType === 'entity-note') {
				const entityType = data.entityType
				const entityId = data.entityId
				if (entityType === 'property' && typeof entityId === 'string') {
					return entityId
				}
				if (entityType === 'asset' && typeof entityId === 'string') {
					const asset = await prisma.asset.findFirst({
						where: { id: entityId, property: { organizationId } },
						select: { propertyId: true },
					})
					if (asset) return asset.propertyId
				}
				if (
					entityType === 'maintenance-event' &&
					typeof entityId === 'string'
				) {
					const request = await prisma.maintenanceEvent.findFirst({
						where: { id: entityId, property: { organizationId } },
						select: { propertyId: true },
					})
					if (request) return request.propertyId
				}
				if (entityType === 'document' && typeof entityId === 'string') {
					const document = await prisma.document.findFirst({
						where: { id: entityId, property: { organizationId } },
						select: { propertyId: true },
					})
					if (document) return document.propertyId
				}
				if (entityType === 'lease' && typeof entityId === 'string') {
					const lease = await prisma.lease.findFirst({
						where: { id: entityId, property: { organizationId } },
						select: { propertyId: true },
					})
					if (lease) return lease.propertyId
				}
			}

			// note-link operations are not used in V1
		}

		return null
	}

	const auditLogs = await prisma.auditLog.findMany({
		where: {
			organizationId,
			entityType: 'draft-change',
			entityId: draft.id,
		},
		select: {
			id: true,
			action: true,
			createdAt: true,
			actor: { select: { name: true, username: true } },
			actorType: true,
			actorLabel: true,
			before: true,
			after: true,
		},
		orderBy: { createdAt: 'desc' },
	})

	const history = auditLogs.map((log) => ({
		...log,
		diffs: diffAuditValues({ before: log.before, after: log.after }),
	}))

	return {
		organizationId,
		membership,
		draft,
		operations,
		timelinePropertyId: await resolveTimelinePropertyId(),
		history,
	}
}

export async function action({ params, request }: Route.ActionArgs) {
	const organizationId = params.orgId
	const draftId = params.draftId
	if (!organizationId || !draftId) {
		throw new Response('Draft not found', { status: 404 })
	}

	const membership = await requireMembership(request, organizationId)
	assertMembershipPermission(membership, 'update:draft-change:any')

	const formData = await request.formData()
	const submission = await parseWithZod(formData, {
		schema: DraftActionSchema,
	})
	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const actor = {
		actorId: membership.userId,
		actorType: 'USER' as const,
		actorMetadata: { via: 'app' },
	}

	if (submission.value.intent === 'approve') {
		await applyDraftChange({
			draftId,
			membership,
			actor,
		})
		return redirectWithToast(`/orgs/${organizationId}/drafts/${draftId}`, {
			title: 'Draft applied',
			description: 'Draft changes were applied to the timeline.',
			type: 'success',
		})
	}

	await rejectDraftChange({
		draftId,
		membership,
		actor,
		reason: submission.value.reason ?? null,
	})
	return redirectWithToast(`/orgs/${organizationId}/drafts/${draftId}`, {
		title: 'Draft rejected',
		description: 'Draft marked as rejected.',
		type: 'message',
	})
}

export default function DraftDetail({ loaderData }: Route.ComponentProps) {
	const isPending = useIsPending()
	const canReview = roleHasPermission(
		loaderData.membership.role,
		'update:draft-change:any',
	)

	const proposedBy =
		loaderData.draft.proposedByLabel ??
		loaderData.draft.proposedBy?.name ??
		loaderData.draft.proposedBy?.username ??
		loaderData.draft.proposedByType ??
		'Unknown'

	return (
		<article className="mx-auto max-w-(--reading-column) px-5 py-8 md:px-8">
			<header className="mb-10">
				<p className="text-body-2xs text-muted-foreground/70 mb-2 uppercase tracking-[0.2em]">
					Draft
				</p>
				<div className="flex flex-wrap items-start gap-3">
					<h1 className="text-h4 font-serif tracking-tight">
						{loaderData.draft.title}
					</h1>
					<span className={cn(
						'mt-1 inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em]',
						draftStatusStyle[loaderData.draft.status] ?? 'bg-muted text-muted-foreground',
					)}>
						{loaderData.draft.status}
					</span>
				</div>
				<p className="mt-2 text-body-xs text-muted-foreground">
					Proposed by {proposedBy}
				</p>
				{loaderData.draft.summary ? (
					<p className="mt-3 text-body-sm leading-relaxed text-muted-foreground">
						{loaderData.draft.summary}
					</p>
				) : null}
				{loaderData.draft.reasoningSummary ||
				loaderData.draft.confidence != null ? (
					<div className="mt-5 rounded-xl border border-border/30 bg-surface p-4">
						<p className="text-body-2xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">
							AI reasoning
						</p>
						{loaderData.draft.reasoningSummary ? (
							<p className="mt-2 text-body-sm leading-relaxed text-muted-foreground">
								{loaderData.draft.reasoningSummary}
							</p>
						) : null}
						{loaderData.draft.confidence != null ? (
							<p className="mt-2 text-body-2xs text-muted-foreground">
								Confidence:{' '}
								<span className="font-semibold text-foreground">
									{Math.round(loaderData.draft.confidence * 100)}%
								</span>
							</p>
						) : null}
					</div>
				) : null}
				{loaderData.draft.status === 'DRAFT' && canReview ? (
					<div className="mt-6 rounded-xl border border-border/40 bg-surface p-5">
						<p className="mb-3 text-body-2xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">
							Review actions
						</p>
						<div className="flex flex-wrap gap-3">
							<Form method="post">
								<input type="hidden" name="intent" value="approve" />
								<input
									type="hidden"
									name="draftId"
									value={loaderData.draft.id}
								/>
								<StatusButton
									type="submit"
									status={isPending ? 'pending' : 'idle'}
									disabled={isPending}
									className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
								>
									Approve & apply
								</StatusButton>
							</Form>
							<Form method="post" className="flex flex-wrap items-center gap-2">
								<input type="hidden" name="intent" value="reject" />
								<input
									type="hidden"
									name="draftId"
									value={loaderData.draft.id}
								/>
								<input
									name="reason"
									placeholder="Reject reason (optional)"
									className="rounded-lg border border-border/40 bg-background px-3 py-2 text-body-xs shadow-xs focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/30"
								/>
								<StatusButton
									type="submit"
									variant="outline"
									status={isPending ? 'pending' : 'idle'}
									disabled={isPending}
								>
									Reject
								</StatusButton>
							</Form>
						</div>
					</div>
				) : null}
				<div className="mt-8 h-px bg-linear-to-r from-border/60 via-border/30 to-transparent" />
			</header>

			<div className="space-y-10">
				<section>
					<div className="mb-4 flex items-center gap-2">
						<span className="h-4 w-[3px] rounded-full bg-accent" />
						<h2 className="text-body-md font-semibold uppercase tracking-[0.2em] text-muted-foreground">
							Overview
						</h2>
					</div>
					<div className="grid gap-3 md:grid-cols-3">
						<div className="rounded-xl border border-border/40 bg-card px-4 py-3 shadow-xs">
							<p className="text-body-2xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">Operations</p>
							<p className="mt-1 text-body-md font-semibold tabular-nums text-foreground">{loaderData.operations.length}</p>
						</div>
						<div className="rounded-xl border border-border/40 bg-card px-4 py-3 shadow-xs">
							<p className="text-body-2xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">Created</p>
							<p className="mt-1 text-body-sm text-foreground">
								{new Intl.DateTimeFormat('en-US', {
									dateStyle: 'medium',
									timeStyle: 'short',
								}).format(loaderData.draft.createdAt)}
							</p>
						</div>
						<div className="rounded-xl border border-border/40 bg-card px-4 py-3 shadow-xs">
							<p className="text-body-2xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">Last reviewed</p>
							<p className="mt-1 text-body-sm text-foreground">
								{loaderData.draft.reviewedAt
									? new Intl.DateTimeFormat('en-US', {
											dateStyle: 'medium',
											timeStyle: 'short',
										}).format(loaderData.draft.reviewedAt)
									: 'Not reviewed'}
							</p>
						</div>
					</div>
				</section>

				<section>
					<div className="mb-4 flex items-center gap-2">
						<span className="h-4 w-[3px] rounded-full bg-accent" />
						<h2 className="text-body-md font-semibold uppercase tracking-[0.2em] text-muted-foreground">
							Proposed operations
						</h2>
					</div>
					<ul className="grid gap-3">
						{loaderData.operations.map((operation, index) => (
							<li key={`${loaderData.draft.id}-${index}`} className="rounded-xl border border-border/40 bg-card p-4 shadow-xs">
								<p className="text-body-2xs font-medium uppercase tracking-widest text-muted-foreground">
									<span className="text-accent">{operation.entityType}</span>
									<span className="mx-1.5 text-border">·</span>
									{operation.op}
								</p>
								<pre className="mt-3 max-h-64 overflow-auto rounded-lg border border-border/30 bg-muted/20 px-4 py-3 text-body-2xs leading-relaxed text-muted-foreground">
									{JSON.stringify(operation.data, null, 2)}
								</pre>
							</li>
						))}
					</ul>
				</section>

				<section>
					<div className="mb-4 flex items-center gap-2">
						<span className="h-4 w-[3px] rounded-full bg-foreground/20" />
						<h2 className="text-body-md font-semibold uppercase tracking-[0.2em] text-muted-foreground">
							Review history
						</h2>
					</div>
					{loaderData.history.length ? (
						<ul className="grid gap-3">
							{loaderData.history.map((entry) => (
								<li key={entry.id} className="relative flex gap-3 rounded-xl border border-border/40 bg-card px-4 py-3 shadow-xs">
									<span className="mt-1 size-2 shrink-0 rounded-full bg-foreground/20 ring-2 ring-background" />
									<div className="min-w-0">
										<p className="text-body-2xs font-medium uppercase tracking-widest text-muted-foreground/70">
											{entry.action}
										</p>
										<p className="mt-0.5 text-body-xs text-muted-foreground">
											{entry.actor?.name ??
												entry.actor?.username ??
												entry.actorLabel ??
												'System'}
											{entry.actorType ? (
												<span className="ml-1.5 text-body-2xs font-medium uppercase text-muted-foreground/60">
													{entry.actorType}
												</span>
											) : null}
											<span className="mx-1 text-border">·</span>
											{new Intl.DateTimeFormat('en-US', {
												dateStyle: 'medium',
												timeStyle: 'short',
											}).format(entry.createdAt)}
										</p>
										{entry.diffs.length ? (
											<ul className="mt-2 grid gap-1 text-body-2xs text-muted-foreground">
												{entry.diffs.map((diff) => (
													<li key={`${entry.id}-${diff.path}`}>
														<span className="text-accent">{diff.path}</span>{' '}
														{JSON.stringify(diff.before)} →{' '}
														{JSON.stringify(diff.after)}
													</li>
												))}
											</ul>
										) : null}
									</div>
								</li>
							))}
						</ul>
					) : (
						<p className="rounded-xl border border-dashed border-border/60 bg-surface px-6 py-8 text-center text-body-sm text-muted-foreground">
							No review history yet.
						</p>
					)}
				</section>
			</div>

			{loaderData.timelinePropertyId ? (
				<p className="mt-10">
					<Link
						to={`/orgs/${loaderData.organizationId}/properties/${loaderData.timelinePropertyId}#timeline`}
						className="text-body-sm font-medium text-accent hover:underline"
					>
						← Go to property timeline
					</Link>
				</p>
			) : null}
		</article>
	)
}
