import { parseWithZod } from '@conform-to/zod'
import { useState } from 'react'
import { data, Form, Link } from 'react-router'
import { z } from 'zod'
import { EmptyState } from '#app/components/empty-state.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { prisma } from '#app/utils/db.server.ts'
import {
	applyDraftChange,
	DraftOperationSchema,
	rejectDraftChange,
} from '#app/utils/draft-change.server.ts'
import {
	assertMembershipPermission,
	requireMembership,
} from '#app/utils/membership.server.ts'
import { cn, useIsPending } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { roleHasPermission } from '#app/utils/user.ts'
import { type Route } from './+types/index.ts'

const DraftStatusSchema = z.enum(['DRAFT', 'APPROVED', 'REJECTED', 'APPLIED'])

const draftStatusStyle: Record<string, string> = {
	DRAFT: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
	APPROVED: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
	APPLIED: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
	REJECTED: 'bg-muted text-muted-foreground',
}

const FilterSchema = z.object({
	status: DraftStatusSchema.optional(),
	query: z.string().optional(),
})

const DraftActionSchema = z.discriminatedUnion('intent', [
	z.object({
		intent: z.literal('approve'),
		draftId: z.string().min(1),
		redirectTo: z.string().optional(),
	}),
	z.object({
		intent: z.literal('reject'),
		draftId: z.string().min(1),
		reason: z.string().optional(),
		redirectTo: z.string().optional(),
	}),
])

export async function loader({ params, request }: Route.LoaderArgs) {
	const organizationId = params.orgId
	if (!organizationId) {
		throw new Response('Workspace not found', { status: 404 })
	}

	const membership = await requireMembership(request, organizationId)
	assertMembershipPermission(membership, 'read:draft-change:any')

	const organization = await prisma.organization.findUnique({
		where: { id: organizationId },
		select: { id: true, name: true },
	})
	if (!organization) {
		throw new Response('Workspace not found', { status: 404 })
	}

	const url = new URL(request.url)
	const filters = FilterSchema.parse({
		status: url.searchParams.get('status') || undefined,
		query: url.searchParams.get('q') || undefined,
	})

	const drafts = await prisma.draftChange.findMany({
		where: {
			organizationId,
			...(filters.status ? { status: filters.status } : {}),
			...(filters.query
				? { title: { contains: filters.query.trim() } }
				: {}),
		},
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
			createdBy: { select: { id: true, name: true, username: true } },
			proposedBy: { select: { id: true, name: true, username: true } },
		},
		orderBy: { createdAt: 'desc' },
	})

	const entries = drafts.map((draft) => {
		let operationCount = 0
		let operationTypes: string[] = []
		try {
			const operations = z
				.array(DraftOperationSchema)
				.parse(draft.operations)
			operationCount = operations.length
			operationTypes = Array.from(
				new Set(operations.map((op) => op.entityType)),
			)
		} catch {
			// ignore malformed operations for display
		}
		return {
			...draft,
			operationCount,
			operationTypes,
		}
	})

	return {
		organization,
		membership,
		filters,
		entries,
	}
}

export async function action({ params, request }: Route.ActionArgs) {
	const organizationId = params.orgId
	if (!organizationId) {
		throw new Response('Workspace not found', { status: 404 })
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

	const redirectTo =
		submission.value.redirectTo &&
		submission.value.redirectTo.startsWith(`/orgs/${organizationId}`)
			? submission.value.redirectTo
			: null

	if (submission.value.intent === 'approve') {
		await applyDraftChange({
			draftId: submission.value.draftId,
			membership,
			actor,
		})
		return redirectWithToast(redirectTo ?? `/orgs/${organizationId}/drafts`, {
			title: 'Draft applied',
			description: 'Draft changes have been added to the workspace timeline.',
			type: 'success',
		})
	}

	await rejectDraftChange({
		draftId: submission.value.draftId,
		membership,
		actor,
		reason: submission.value.reason ?? null,
	})
	return redirectWithToast(redirectTo ?? `/orgs/${organizationId}/drafts`, {
		title: 'Draft rejected',
		description: 'Draft has been marked as rejected.',
		type: 'message',
	})
}

export default function DraftsIndex({ loaderData }: Route.ComponentProps) {
	const isPending = useIsPending()
	const canReview = roleHasPermission(
		loaderData.membership.role,
		'update:draft-change:any',
	)

	return (
		<article className="mx-auto max-w-(--reading-column) px-5 py-8 md:px-8">
			<header className="mb-8">
				<p className="text-body-2xs text-muted-foreground/70 mb-2 uppercase tracking-[0.2em]">
					{loaderData.organization.name}
				</p>
				<h1 className="text-h4 font-serif tracking-tight">AI Agent</h1>
				<p className="mt-1 text-body-xs text-muted-foreground">
					Review AI or collaborator proposals before they land in the
					timeline.
				</p>
				<div className="mt-6 h-px bg-linear-to-r from-border/60 via-border/30 to-transparent" />
			</header>

			<McpCallout />

			<Form method="get" className="mb-8 flex flex-wrap gap-2 rounded-xl border border-border/30 bg-surface p-3">
				<select
					name="status"
					defaultValue={loaderData.filters.status ?? ''}
					className="rounded-lg border border-border/40 bg-background px-3 py-2 text-body-xs shadow-xs focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/30"
				>
					<option value="">All statuses</option>
					<option value="DRAFT">Draft</option>
					<option value="APPLIED">Applied</option>
					<option value="REJECTED">Rejected</option>
					<option value="APPROVED">Approved</option>
				</select>
				<input
					type="search"
					name="q"
					defaultValue={loaderData.filters.query ?? ''}
					placeholder="Search drafts"
					className="w-full max-w-sm rounded-lg border border-border/40 bg-background px-3 py-2 text-body-xs shadow-xs focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/30"
				/>
				<StatusButton type="submit" size="sm" status="idle">
					Filter
				</StatusButton>
				<Link
					to={`/orgs/${loaderData.organization.id}/drafts`}
					className="inline-flex items-center justify-center rounded-lg border border-border/40 bg-background px-3 py-2 text-body-xs font-medium shadow-xs hover:bg-muted/40"
				>
					Clear
				</Link>
			</Form>

			{loaderData.entries.length ? (
				<ul className="space-y-3">
					{loaderData.entries.map((draft) => {
						const proposedBy =
							draft.proposedByLabel ??
							draft.proposedBy?.name ??
							draft.proposedBy?.username ??
							draft.proposedByType ??
							'Unknown'

						return (
							<li key={draft.id} className="rounded-xl border border-border/40 bg-card px-5 py-4 shadow-xs">
								<div className="flex flex-wrap items-start justify-between gap-4">
									<div className="grid gap-1.5">
										<h2 className="text-body-sm font-medium">
											<Link
												to={`/orgs/${loaderData.organization.id}/drafts/${draft.id}`}
												className="hover:underline"
											>
												{draft.title}
											</Link>
										</h2>
										{draft.summary ? (
											<p className="text-body-xs leading-relaxed text-muted-foreground">
												{draft.summary}
											</p>
										) : null}
										<p className="text-body-2xs text-muted-foreground">
											{draft.operationCount} operations ·{' '}
											{draft.operationTypes.length ? (
												<>
													{draft.operationTypes.map((et, i) => (
														<span key={et}>
															{i > 0 && ', '}
															<span className="text-accent">[[{et}]]</span>
														</span>
													))}
												</>
											) : (
												'Uncategorized'
											)}
											<span className="mx-1 text-border">·</span>
											Proposed by {proposedBy}
										</p>
									</div>
									<div className="flex flex-col items-end gap-1.5">
										<span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em]', draftStatusStyle[draft.status] ?? 'bg-muted text-muted-foreground')}>
											{draft.status}
										</span>
										<p className="text-body-2xs text-muted-foreground">
											{new Intl.DateTimeFormat('en-US', {
												dateStyle: 'medium',
											}).format(draft.createdAt)}
										</p>
									</div>
								</div>

								<details className="mt-4 rounded-lg border border-border/30 bg-muted/10 px-4 py-3">
									<summary className="cursor-pointer text-body-2xs font-semibold text-muted-foreground">
										View operations
									</summary>
									<pre className="mt-3 max-h-80 overflow-auto rounded-lg border border-border/30 bg-background px-4 py-3 text-body-2xs leading-relaxed text-muted-foreground">
										{JSON.stringify(draft.operations, null, 2)}
									</pre>
								</details>

								{draft.status === 'DRAFT' && canReview ? (
									<div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/30 pt-4">
										<Form method="post">
											<input
												type="hidden"
												name="intent"
												value="approve"
											/>
											<input
												type="hidden"
												name="draftId"
												value={draft.id}
											/>
											<StatusButton
												type="submit"
												size="sm"
												status={isPending ? 'pending' : 'idle'}
												disabled={isPending}
												className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
											>
												Approve & apply
											</StatusButton>
										</Form>
										<Form method="post" className="flex flex-wrap items-center gap-2">
											<input
												type="hidden"
												name="intent"
												value="reject"
											/>
											<input
												type="hidden"
												name="draftId"
												value={draft.id}
											/>
											<input
												name="reason"
												placeholder="Reject reason (optional)"
												className="rounded-lg border border-border/40 bg-background px-3 py-2 text-body-xs shadow-xs focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/30"
											/>
											<StatusButton
												type="submit"
												variant="outline"
												size="sm"
												status={isPending ? 'pending' : 'idle'}
												disabled={isPending}
											>
												Reject
											</StatusButton>
										</Form>
									</div>
								) : null}
							</li>
						)
					})}
				</ul>
			) : (
				<EmptyState
					icon="pencil-1"
					title="No drafts match your filters"
					description="New AI proposals will appear here for review. Connect your MCP server to get started."
				/>
			)}
		</article>
	)
}

const MCP_DRAFTS_DISMISSED_KEY = 'openclaw-mcp-drafts-dismissed'

function McpCallout() {
	const [dismissed, setDismissed] = useState(() => {
		if (typeof window === 'undefined') return false
		try {
			return localStorage.getItem(MCP_DRAFTS_DISMISSED_KEY) === '1'
		} catch {
			return false
		}
	})

	if (dismissed) return null

	function handleDismiss() {
		setDismissed(true)
		try {
			localStorage.setItem(MCP_DRAFTS_DISMISSED_KEY, '1')
		} catch {
			// localStorage unavailable
		}
	}

	return (
		<div className="relative mb-8 rounded-xl border border-accent/20 bg-accent/5 p-4">
			<button
				onClick={handleDismiss}
				className="absolute top-2.5 right-2.5 rounded p-0.5 text-muted-foreground/60 hover:text-foreground"
				aria-label="Dismiss"
			>
				<svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
			<p className="text-body-2xs font-semibold text-accent">
				MCP Compatible
			</p>
			<p className="mt-1 max-w-lg text-body-2xs leading-relaxed text-muted-foreground">
				Connect your MCP server to OpenClaw PM for the best results.
				AI agents can read your property data, propose changes, and
				draft insights directly.
			</p>
			<Link
				to="/settings/profile"
				className="mt-2 inline-block text-body-2xs font-medium text-accent hover:underline"
			>
				Set up MCP access →
			</Link>
		</div>
	)
}
