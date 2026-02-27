import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Form, Link } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/index.ts'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

const FilterSchema = z.object({
	method: z.string().optional(),
	status: z.string().optional(),
	organizationId: z.string().optional(),
	actorId: z.string().optional(),
	actorType: z.enum(['USER', 'MCP', 'SYSTEM', 'AGENT']).optional(),
	actorLabel: z.string().optional(),
})

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const url = new URL(request.url)
	const filters = FilterSchema.parse({
		method: url.searchParams.get('method') ?? undefined,
		status: url.searchParams.get('status') ?? undefined,
		organizationId: url.searchParams.get('organizationId') ?? undefined,
		actorId: url.searchParams.get('actorId') ?? undefined,
		actorType: url.searchParams.get('actorType') ?? undefined,
		actorLabel: url.searchParams.get('actorLabel') ?? undefined,
	})

	const where = {
		...(filters.method
			? { method: { contains: filters.method, mode: 'insensitive' } }
			: {}),
		...(filters.status ? { status: filters.status } : {}),
		...(filters.organizationId
			? { organizationId: filters.organizationId }
			: {}),
		...(filters.actorId ? { actorId: filters.actorId } : {}),
		...(filters.actorType ? { actorType: filters.actorType } : {}),
		...(filters.actorLabel
			? { actorLabel: { contains: filters.actorLabel } }
			: {}),
	}

	const [invocations, total] = await Promise.all([
		prisma.mcpToolInvocation.findMany({
			where,
			select: {
				id: true,
				method: true,
				paramsHash: true,
				resultSummary: true,
				status: true,
				durationMs: true,
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
		prisma.mcpToolInvocation.count({ where }),
	])

	return {
		filters,
		total,
		invocations,
	}
}

export default function AdminMcpLog({ loaderData }: Route.ComponentProps) {
	const latestMethod = loaderData.invocations[0]?.method ?? '—'
	return (
		<div className="mx-auto flex max-w-(--reading-column) flex-col gap-8 px-6 py-10 md:px-8">
			<header className="mb-2">
				<p className="text-body-2xs text-muted-foreground/70 uppercase tracking-[0.2em]">
					Admin
				</p>
				<h1 className="text-h4 font-serif tracking-tight">MCP tool log</h1>
				<p className="text-body-2xs text-muted-foreground mt-1">
					Audit trail of MCP tool calls and responses.
				</p>
				<div className="mt-3 flex flex-wrap gap-3 text-body-2xs text-muted-foreground">
					<Link to="/admin/audit" className="hover:text-foreground">
						Audit history
					</Link>
					<Link to="/admin/users" className="hover:text-foreground">
						Back to users
					</Link>
				</div>
				<div className="mt-6 grid gap-4 text-body-2xs text-muted-foreground md:grid-cols-3">
					<div>
						<p className="uppercase tracking-[0.2em] text-muted-foreground/70">
							Matching calls
						</p>
						<p className="text-body-sm text-foreground">{loaderData.total}</p>
					</div>
					<div>
						<p className="uppercase tracking-[0.2em] text-muted-foreground/70">
							Showing
						</p>
						<p className="text-body-sm text-foreground">
							{loaderData.invocations.length}
						</p>
					</div>
					<div>
						<p className="uppercase tracking-[0.2em] text-muted-foreground/70">
							Latest tool
						</p>
						<p className="text-body-sm text-foreground">{latestMethod}</p>
					</div>
				</div>
			</header>

			<section className="border-y border-border/40 py-4">
				<h2 className="text-body-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
					Filters
				</h2>
				<Form method="get" className="mt-4 grid gap-4 md:grid-cols-6">
					<div className="grid gap-1 md:col-span-2">
						<label className="text-body-2xs text-muted-foreground">Method</label>
						<input
							name="method"
							defaultValue={loaderData.filters.method ?? ''}
							placeholder="property_list"
							className="rounded-md border border-border/60 bg-background/60 px-3 py-2 text-sm"
						/>
					</div>
					<div className="grid gap-1">
						<label className="text-body-2xs text-muted-foreground">Status</label>
						<select
							name="status"
							defaultValue={loaderData.filters.status ?? ''}
							className="rounded-md border border-border/60 bg-background/60 px-3 py-2 text-sm"
						>
							<option value="">All</option>
							<option value="ok">OK</option>
							<option value="error">Error</option>
						</select>
					</div>
					<div className="grid gap-1 md:col-span-2">
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
						<label className="text-body-2xs text-muted-foreground">Actor ID</label>
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
					<div className="flex items-end gap-2 md:col-span-2">
						<button
							type="submit"
							className="text-body-2xs text-muted-foreground hover:text-foreground"
						>
							Apply filters
						</button>
						<Link
							to="/admin/mcp"
							className="text-body-2xs text-muted-foreground hover:text-foreground"
						>
							Clear
						</Link>
					</div>
				</Form>
			</section>

			<section className="grid gap-4">
				<h2 className="text-body-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
					MCP calls
				</h2>
				{loaderData.invocations.length ? (
					<ul className="divide-y divide-border/40">
						{loaderData.invocations.map((entry) => (
							<li key={entry.id} className="py-4">
								<div className="flex flex-wrap items-start justify-between gap-4">
									<div>
										<p className="font-semibold text-foreground">
											{entry.method}
										</p>
										<p className="text-body-xs text-muted-foreground">
											{entry.actor?.name ??
												entry.actor?.username ??
												entry.actorLabel ??
												'System'}{' '}
											{entry.actorType ? (
												<span className="ml-1 inline-flex items-center rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
													{entry.actorType}
												</span>
											) : null}{' '}
											•{' '}
											{new Intl.DateTimeFormat('en-US', {
												dateStyle: 'medium',
												timeStyle: 'short',
											}).format(entry.createdAt)}
										</p>
										<p className="mt-1 text-body-xs text-muted-foreground">
											Workspace: {entry.organization.name}
										</p>
									</div>
									<div className="flex flex-col items-end gap-2 text-right">
										<span
											className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
												entry.status === 'error'
													? 'border-destructive/50 text-destructive'
													: 'border-emerald-500/40 text-emerald-600'
											}`}
										>
											{entry.status ?? 'unknown'}
										</span>
										<p className="text-body-xs text-muted-foreground">
											Duration: {entry.durationMs ?? 0}ms
										</p>
									</div>
								</div>
								<div className="mt-3 grid gap-2 text-body-xs text-muted-foreground">
									<p>Result: {entry.resultSummary ?? '—'}</p>
									<p>Params hash: {entry.paramsHash ?? '—'}</p>
								</div>
							</li>
						))}
					</ul>
				) : (
					<p className="text-body-sm text-muted-foreground">
						No MCP calls found.
					</p>
				)}
			</section>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
