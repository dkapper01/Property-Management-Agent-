import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Form, Link } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { diffAuditValues } from '#app/utils/audit-diff.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/index.ts'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

const FilterSchema = z.object({
	entityType: z.string().optional(),
	entityId: z.string().optional(),
	action: z.enum(['CREATE', 'UPDATE', 'DELETE']).optional(),
	organizationId: z.string().optional(),
	actorId: z.string().optional(),
	actorType: z.enum(['USER', 'MCP', 'SYSTEM', 'AGENT']).optional(),
	actorLabel: z.string().optional(),
})

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const url = new URL(request.url)
	const filters = FilterSchema.parse({
		entityType: url.searchParams.get('entityType') ?? undefined,
		entityId: url.searchParams.get('entityId') ?? undefined,
		action: url.searchParams.get('action') ?? undefined,
		organizationId: url.searchParams.get('organizationId') ?? undefined,
		actorId: url.searchParams.get('actorId') ?? undefined,
		actorType: url.searchParams.get('actorType') || undefined,
		actorLabel: url.searchParams.get('actorLabel') ?? undefined,
	})

	const where = {
		...(filters.entityType ? { entityType: filters.entityType } : {}),
		...(filters.entityId ? { entityId: filters.entityId } : {}),
		...(filters.action ? { action: filters.action } : {}),
		...(filters.organizationId
			? { organizationId: filters.organizationId }
			: {}),
		...(filters.actorId ? { actorId: filters.actorId } : {}),
		...(filters.actorType ? { actorType: filters.actorType } : {}),
		...(filters.actorLabel
			? { actorLabel: { contains: filters.actorLabel } }
			: {}),
	}

	const [auditLogs, total] = await Promise.all([
		prisma.auditLog.findMany({
			where,
			select: {
				id: true,
				action: true,
				entityType: true,
				entityId: true,
				before: true,
				after: true,
				createdAt: true,
				organization: { select: { id: true, name: true } },
				actor: { select: { id: true, name: true, username: true } },
				actorType: true,
				actorLabel: true,
				actorMetadata: true,
			},
			orderBy: { createdAt: 'desc' },
			take: 50,
		}),
		prisma.auditLog.count({ where }),
	])

	const entries = auditLogs.map((log) => ({
		...log,
		diffs: diffAuditValues({ before: log.before, after: log.after }),
	}))

	return {
		filters,
		total,
		logs: entries,
	}
}

export default function AdminAuditLog({ loaderData }: Route.ComponentProps) {
	return (
		<div className="mx-auto flex max-w-(--reading-column) flex-col gap-8 px-6 py-10 md:px-8">
			<header className="mb-2">
				<p className="text-body-2xs text-muted-foreground/70 uppercase tracking-[0.2em]">
					Admin
				</p>
				<h1 className="text-h4 font-serif tracking-tight">Audit history</h1>
				<p className="text-body-2xs text-muted-foreground mt-1">
					Immutable change history across workspaces.
				</p>
				<div className="mt-3 flex flex-wrap gap-3 text-body-2xs text-muted-foreground">
					<Link to="/admin/mcp" className="hover:text-foreground">
						MCP tool logs
					</Link>
					<Link to="/admin/users" className="hover:text-foreground">
						Back to users
					</Link>
				</div>
				<div className="mt-6 grid gap-4 text-body-2xs text-muted-foreground md:grid-cols-3">
					<div>
						<p className="uppercase tracking-[0.2em] text-muted-foreground/70">
							Matching logs
						</p>
						<p className="text-body-sm text-foreground">{loaderData.total}</p>
					</div>
					<div>
						<p className="uppercase tracking-[0.2em] text-muted-foreground/70">
							Showing
						</p>
						<p className="text-body-sm text-foreground">
							{loaderData.logs.length}
						</p>
					</div>
					<div>
						<p className="uppercase tracking-[0.2em] text-muted-foreground/70">
							Latest action
						</p>
						<p className="text-body-sm text-foreground">
							{loaderData.logs[0]?.action ?? '—'}
						</p>
					</div>
				</div>
			</header>

			<section className="border-y border-border/40 py-4">
				<h2 className="text-body-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
					Filters
				</h2>
				<Form method="get" className="mt-4 grid gap-4 md:grid-cols-6">
					<div className="grid gap-1">
						<label className="text-body-2xs text-muted-foreground">
							Entity type
						</label>
						<input
							name="entityType"
							defaultValue={loaderData.filters.entityType ?? ''}
							placeholder="property"
							className="rounded-md border border-border/60 bg-background/60 px-3 py-2 text-sm"
						/>
					</div>
					<div className="grid gap-1 md:col-span-2">
						<label className="text-body-2xs text-muted-foreground">
							Entity ID
						</label>
						<input
							name="entityId"
							defaultValue={loaderData.filters.entityId ?? ''}
							placeholder="cml..."
							className="rounded-md border border-border/60 bg-background/60 px-3 py-2 text-sm"
						/>
					</div>
					<div className="grid gap-1">
						<label className="text-body-2xs text-muted-foreground">Action</label>
						<select
							name="action"
							defaultValue={loaderData.filters.action ?? ''}
							className="rounded-md border border-border/60 bg-background/60 px-3 py-2 text-sm"
						>
							<option value="">All</option>
							<option value="CREATE">Create</option>
							<option value="UPDATE">Update</option>
							<option value="DELETE">Delete</option>
						</select>
					</div>
					<div className="grid gap-1">
						<label className="text-body-2xs text-muted-foreground">
							Workspace ID
						</label>
						<input
							name="organizationId"
							defaultValue={loaderData.filters.organizationId ?? ''}
							placeholder="cml..."
							className="rounded-md border border-border/60 bg-background/60 px-3 py-2 text-sm"
						/>
					</div>
					<div className="grid gap-1 md:col-span-2">
						<label className="text-body-2xs text-muted-foreground">
							Actor ID
						</label>
						<input
							name="actorId"
							defaultValue={loaderData.filters.actorId ?? ''}
							placeholder="cml..."
							className="rounded-md border border-border/60 bg-background/60 px-3 py-2 text-sm"
						/>
					</div>
					<div className="grid gap-1">
						<label className="text-body-2xs text-muted-foreground">
							Actor type
						</label>
						<select
							name="actorType"
							defaultValue={loaderData.filters.actorType ?? ''}
							className="rounded-md border border-border/60 bg-background/60 px-3 py-2 text-sm"
						>
							<option value="">All</option>
							<option value="USER">User</option>
							<option value="MCP">MCP</option>
							<option value="AGENT">Agent</option>
							<option value="SYSTEM">System</option>
						</select>
					</div>
					<div className="grid gap-1 md:col-span-2">
						<label className="text-body-2xs text-muted-foreground">
							Actor label
						</label>
						<input
							name="actorLabel"
							defaultValue={loaderData.filters.actorLabel ?? ''}
							placeholder="MCP Jam"
							className="rounded-md border border-border/60 bg-background/60 px-3 py-2 text-sm"
						/>
					</div>
					<div className="flex items-end gap-2 md:col-span-3">
						<button
							type="submit"
							className="text-body-2xs text-muted-foreground hover:text-foreground"
						>
							Apply filters
						</button>
						<Link
							to="/admin/audit"
							className="text-body-2xs text-muted-foreground hover:text-foreground"
						>
							Clear
						</Link>
					</div>
				</Form>
			</section>

			<section className="grid gap-4">
				<h2 className="text-body-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
					Audit entries
				</h2>
				{loaderData.logs.length ? (
					<ul className="divide-y divide-border/40">
						{loaderData.logs.map((log) => (
							<li key={log.id} className="py-4">
								<div className="flex flex-wrap items-start justify-between gap-4">
									<div>
										<p className="font-semibold text-foreground">
											{log.action} {log.entityType}
										</p>
										<p className="text-body-xs text-muted-foreground">
											{log.actor?.name ??
												log.actor?.username ??
												log.actorLabel ??
												'System'}{' '}
											{log.actorType ? (
												<span className="ml-1 inline-flex items-center rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
													{log.actorType}
												</span>
											) : null}{' '}
											•{' '}
											{new Intl.DateTimeFormat('en-US', {
												dateStyle: 'medium',
												timeStyle: 'short',
											}).format(log.createdAt)}
										</p>
										<p className="mt-1 text-body-xs text-muted-foreground">
											Workspace: {log.organization.name}
										</p>
										<p className="text-body-xs text-muted-foreground">
											Entity ID: {log.entityId}
										</p>
									</div>
								</div>
								{log.diffs.length ? (
									<ul className="mt-4 grid gap-2 text-body-xs text-muted-foreground">
										{log.diffs.slice(0, 10).map((diff) => (
											<li
												key={`${log.id}-${diff.path}`}
												className="rounded-md border border-border/50 bg-muted/20 px-3 py-2"
											>
												<span className="font-semibold text-foreground">
													{diff.path}
												</span>
												<span className="ml-2">
													{JSON.stringify(diff.before)} →{' '}
													{JSON.stringify(diff.after)}
												</span>
											</li>
										))}
									</ul>
								) : (
									<p className="mt-3 text-body-xs text-muted-foreground">
										No field-level changes captured.
									</p>
								)}
							</li>
						))}
					</ul>
				) : (
					<p className="text-body-sm text-muted-foreground">
						No audit entries match this filter.
					</p>
				)}
			</section>
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				403: ({ error }) => (
					<p>You are not allowed to do that: {error?.data.message}</p>
				),
			}}
		/>
	)
}
