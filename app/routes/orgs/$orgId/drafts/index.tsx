import { parseWithZod } from '@conform-to/zod'
import { useState } from 'react'
import { data, Form, Link } from 'react-router'
import { z } from 'zod'
import { cn } from '#app/utils/misc.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	applyDraftChange,
	DraftOperationSchema,
	rejectDraftChange,
} from '#app/utils/draft-change.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	assertMembershipPermission,
	requireMembership,
} from '#app/utils/membership.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
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
			<header className="mb-6">
				<h1 className="text-h4 font-serif tracking-tight">AI Agent</h1>
				<p className="text-body-2xs text-muted-foreground">
					Review AI or collaborator proposals before they land in the
					timeline.
				</p>
			</header>

			<McpCallout />

			<Form method="get" className="mb-10 flex flex-wrap gap-3">
				<select
					name="status"
					defaultValue={loaderData.filters.status ?? ''}
					className="rounded-md border border-border/40 bg-background/60 px-3 py-2 text-sm"
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
					className="w-full max-w-sm rounded-md border border-border/40 bg-background/60 px-3 py-2 text-sm"
				/>
				<StatusButton type="submit" size="sm" status="idle">
					Filter
				</StatusButton>
				<Link
					to={`/orgs/${loaderData.organization.id}/drafts`}
					className="inline-flex items-center justify-center rounded-md border border-border/40 bg-background/60 px-3 py-2 text-sm font-medium hover:bg-muted/40"
				>
					Clear
				</Link>
			</Form>

			{loaderData.entries.length ? (
				<ul className="divide-y divide-border/40">
					{loaderData.entries.map((draft) => {
						const proposedBy =
							draft.proposedByLabel ??
							draft.proposedBy?.name ??
							draft.proposedBy?.username ??
							draft.proposedByType ??
							'Unknown'

						return (
							<li key={draft.id} className="py-6 first:pt-0">
								<div className="flex flex-wrap items-start justify-between gap-4">
									<div className="grid gap-1">
										<span className={cn('inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em]', draftStatusStyle[draft.status] ?? 'bg-muted text-muted-foreground')}>
											{draft.status}
										</span>
										<h2 className="text-body-sm font-medium">
											<Link
												to={`/orgs/${loaderData.organization.id}/drafts/${draft.id}`}
												className="hover:underline"
											>
												{draft.title}
											</Link>
										</h2>
										{draft.summary ? (
											<p className="text-body-xs text-muted-foreground">
												{draft.summary}
											</p>
										) : null}
										<p className="text-body-xs text-muted-foreground">
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
										</p>
										<p className="text-body-xs text-muted-foreground">
											Proposed by {proposedBy}
										</p>
									</div>
									<div className="text-right text-body-xs text-muted-foreground">
										<p>
											Created{' '}
											{new Intl.DateTimeFormat('en-US', {
												dateStyle: 'medium',
												timeStyle: 'short',
											}).format(draft.createdAt)}
										</p>
										{draft.appliedAt ? (
											<p>
												Applied{' '}
												{new Intl.DateTimeFormat('en-US', {
													dateStyle: 'medium',
													timeStyle: 'short',
												}).format(draft.appliedAt)}
											</p>
										) : null}
									</div>
								</div>

								<details className="mt-4 rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
									<summary className="cursor-pointer text-body-2xs font-semibold text-muted-foreground">
										View operations
									</summary>
									<pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-background px-3 py-2 text-body-2xs text-muted-foreground">
										{JSON.stringify(draft.operations, null, 2)}
									</pre>
								</details>

								{draft.status === 'DRAFT' && canReview ? (
									<div className="mt-4 flex flex-wrap items-center gap-3">
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
												className="rounded-md border border-border/40 bg-background/60 px-3 py-2 text-sm"
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
				<div className="rounded-xl border border-dashed border-border/60 p-6 text-body-sm text-muted-foreground">
					<p className="font-semibold text-foreground">
						No drafts match your filters
					</p>
					<p className="mt-1">
						New AI proposals will appear here for review.
					</p>
				</div>
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
