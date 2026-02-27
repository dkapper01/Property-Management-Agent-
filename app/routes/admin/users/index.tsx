import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { formatDistanceToNow } from 'date-fns'
import {
	Form,
	Link,
	redirect,
	useSearchParams,
	useSubmit,
} from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Field } from '#app/components/forms.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { useDebounce, useIsPending } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/index.ts'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')
	const searchParams = new URL(request.url).searchParams
	const originalQuery = searchParams.get('query')
	const query = originalQuery?.trim() ?? ''
	const originalRole = searchParams.get('role')
	const roleParam = originalRole?.trim() ?? ''

	if (originalQuery === '') {
		searchParams.delete('query')
		const next = searchParams.toString()
		return redirect(next ? `/admin/users?${next}` : '/admin/users')
	}
	if (originalRole === '') {
		searchParams.delete('role')
		const next = searchParams.toString()
		return redirect(next ? `/admin/users?${next}` : '/admin/users')
	}

	const limitParam = searchParams.get('limit')
	const limitValue = limitParam ? Number(limitParam) : DEFAULT_LIMIT
	const limit = Number.isFinite(limitValue)
		? Math.min(Math.max(limitValue, 1), MAX_LIMIT)
		: DEFAULT_LIMIT

	const roles = await prisma.role.findMany({
		orderBy: { name: 'asc' },
		select: { id: true, name: true, description: true },
	})

	const roleNames = new Set(roles.map((role) => role.name))
	if (roleParam && roleParam !== 'none' && !roleNames.has(roleParam)) {
		searchParams.delete('role')
		const next = searchParams.toString()
		return redirect(next ? `/admin/users?${next}` : '/admin/users')
	}

	const whereClauses = []
	if (query) {
		whereClauses.push({
			OR: [
				{ name: { contains: query, mode: 'insensitive' } },
				{ username: { contains: query, mode: 'insensitive' } },
				{ email: { contains: query, mode: 'insensitive' } },
			],
		})
	}

	if (roleParam) {
		whereClauses.push(
			roleParam === 'none'
				? { roles: { none: {} } }
				: { roles: { some: { name: roleParam } } },
		)
	}

	const where = whereClauses.length > 0 ? { AND: whereClauses } : undefined

	const users = await prisma.user.findMany({
		where,
		orderBy: { createdAt: 'desc' },
		take: limit,
		select: {
			id: true,
			name: true,
			username: true,
			email: true,
			createdAt: true,
			roles: {
				select: {
					id: true,
					name: true,
				},
			},
		},
	})

	return { users, query, limit, roles, selectedRole: roleParam }
}

export default function AdminUsersIndex({ loaderData }: Route.ComponentProps) {
	const [searchParams] = useSearchParams()
	const submit = useSubmit()
	const isPending = useIsPending({
		formMethod: 'GET',
		formAction: '/admin/users',
	})
	const activeQuery = searchParams.get('query') ?? loaderData.query
	const activeRole = searchParams.get('role') ?? loaderData.selectedRole ?? ''
	const hasFilters = Boolean(activeQuery || activeRole)
	const adminCount = loaderData.users.filter((user) =>
		user.roles.some((role) => role.name === 'admin'),
	).length
	const unassignedCount = loaderData.users.filter(
		(user) => user.roles.length === 0,
	).length

	const handleFormChange = useDebounce(async (form: HTMLFormElement) => {
		await submit(form)
	}, 400)

	return (
		<div className="mx-auto flex max-w-(--reading-column) flex-col gap-8 px-6 py-10 md:px-8">
			<header className="mb-2">
				<p className="text-body-2xs text-muted-foreground/70 uppercase tracking-[0.2em]">
					Admin
				</p>
				<h1 className="text-h4 font-serif tracking-tight">User Management</h1>
				<p className="text-body-2xs text-muted-foreground mt-1">
					Search, review, and manage user roles.
				</p>
				<div className="mt-3 flex flex-wrap gap-3 text-body-2xs text-muted-foreground">
					<Link to="/admin/roles" className="hover:text-foreground">
						Role permissions
					</Link>
					<Link to="/admin/audit" className="hover:text-foreground">
						Audit history
					</Link>
					<Link to="/admin/mcp" className="hover:text-foreground">
						MCP tool logs
					</Link>
				</div>
				<div className="mt-6 grid gap-4 text-body-2xs text-muted-foreground md:grid-cols-3">
					<div>
						<p className="uppercase tracking-[0.2em] text-muted-foreground/70">
							Results
						</p>
						<p className="text-body-sm text-foreground">
							{loaderData.users.length}
						</p>
						<p>Showing the most recent {loaderData.limit}</p>
					</div>
					<div>
						<p className="uppercase tracking-[0.2em] text-muted-foreground/70">
							Admins
						</p>
						<p className="text-body-sm text-foreground">{adminCount}</p>
						<p>Admin access in current results</p>
					</div>
					<div>
						<p className="uppercase tracking-[0.2em] text-muted-foreground/70">
							Unassigned
						</p>
						<p className="text-body-sm text-foreground">{unassignedCount}</p>
						<p>Users without roles</p>
					</div>
				</div>
			</header>

			<Form
				method="get"
				className="grid gap-4 border-y border-border/40 py-4"
				onChange={(event) => handleFormChange(event.currentTarget)}
			>
				<div className="grid gap-4 lg:grid-cols-[1fr_180px_220px_auto]">
					<Field
						labelProps={{ children: 'Search users' }}
						inputProps={{
							name: 'query',
							defaultValue: activeQuery,
							placeholder: 'Search by name, username, or email',
							type: 'search',
						}}
					/>
					<Field
						labelProps={{ children: 'Limit' }}
						inputProps={{
							name: 'limit',
							defaultValue:
								searchParams.get('limit') ?? String(loaderData.limit),
							type: 'number',
							min: '1',
							max: String(MAX_LIMIT),
							step: '1',
						}}
					/>
					<div className="grid gap-1">
						<label
							htmlFor="role-filter"
							className="text-body-2xs text-muted-foreground"
						>
							Role filter
						</label>
						<select
							id="role-filter"
							name="role"
							defaultValue={activeRole}
							className="w-full rounded-md border border-border/60 bg-background/60 px-3 py-2 text-sm"
						>
							<option value="">All roles</option>
							<option value="none">No roles assigned</option>
							{loaderData.roles.map((role) => (
								<option key={role.id} value={role.name}>
									{role.name.replace('_', ' ')}
								</option>
							))}
						</select>
					</div>
					<div className="flex items-end justify-end gap-2 pb-3">
						{hasFilters ? (
							<Link
								to="/admin/users"
								className="text-body-2xs text-muted-foreground hover:text-foreground"
							>
								Clear
							</Link>
						) : null}
						<StatusButton
							type="submit"
							status={isPending ? 'pending' : 'idle'}
							className="w-full"
						>
							Search
						</StatusButton>
					</div>
				</div>
			</Form>

			<section className="grid gap-4">
				<div className="flex items-center justify-between border-b border-border/40 pb-2">
					<h2 className="text-body-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
						Users
					</h2>
					<p className="text-body-2xs text-muted-foreground">
						{loaderData.users.length} result
						{loaderData.users.length === 1 ? '' : 's'}
					</p>
				</div>
				{loaderData.users.length ? (
					<ul className="divide-y divide-border/40">
						{loaderData.users.map((user) => {
							const displayName = user.name ?? user.username
							const isAdmin = user.roles.some((role) => role.name === 'admin')
							return (
								<li
									key={user.id}
									className="flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between"
								>
									<div className="grid gap-1">
										<p className="text-body-sm font-semibold">{displayName}</p>
										<p className="text-body-xs text-muted-foreground">
											@{user.username} • {user.email}
										</p>
										<p className="text-body-xs text-muted-foreground">
											Created{' '}
											{formatDistanceToNow(new Date(user.createdAt), {
												addSuffix: true,
											})}
										</p>
									</div>
									<div className="flex flex-wrap items-center gap-2 md:justify-end">
										{user.roles.length ? (
											user.roles.map((role) => (
												<span
													key={role.id}
													className={
														isAdmin && role.name === 'admin'
															? 'rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary'
															: 'rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'
													}
												>
													{role.name.replace('_', ' ')}
												</span>
											))
										) : (
											<span className="text-body-xs text-muted-foreground">
												No roles assigned
											</span>
										)}
										<Link
											to={`/admin/users/${user.id}`}
											className="text-body-2xs text-muted-foreground hover:text-foreground"
										>
											Manage
										</Link>
									</div>
								</li>
							)
						})}
					</ul>
				) : (
					<p className="text-body-sm text-muted-foreground">
						No users match this search.
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
