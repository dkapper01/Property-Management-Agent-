import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/index.ts'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')
	const roles = await prisma.role.findMany({
		orderBy: { name: 'asc' },
		select: {
			id: true,
			name: true,
			description: true,
			_count: { select: { permissions: true, users: true, memberships: true } },
		},
	})

	return { roles }
}

export default function AdminRolesIndex({ loaderData }: Route.ComponentProps) {
	const totals = loaderData.roles.reduce(
		(acc, role) => {
			acc.permissions += role._count.permissions
			acc.users += role._count.users
			acc.memberships += role._count.memberships
			return acc
		},
		{ permissions: 0, users: 0, memberships: 0 },
	)

	return (
		<div className="mx-auto flex max-w-(--reading-column) flex-col gap-8 px-6 py-10 md:px-8">
			<header className="mb-2">
				<p className="text-body-2xs text-muted-foreground/70 uppercase tracking-[0.2em]">
					Admin
				</p>
				<h1 className="text-h4 font-serif tracking-tight">Role Permissions</h1>
				<p className="text-body-2xs text-muted-foreground mt-1">
					Manage what each role can do across the platform.
				</p>
				<div className="mt-3 flex flex-wrap gap-3 text-body-2xs text-muted-foreground">
					<Link to="/admin/users" className="hover:text-foreground">
						Back to users
					</Link>
				</div>
				<div className="mt-6 grid gap-4 text-body-2xs text-muted-foreground md:grid-cols-4">
					<div>
						<p className="uppercase tracking-[0.2em] text-muted-foreground/70">
							Roles
						</p>
						<p className="text-body-sm text-foreground">
							{loaderData.roles.length}
						</p>
					</div>
					<div>
						<p className="uppercase tracking-[0.2em] text-muted-foreground/70">
							Permissions
						</p>
						<p className="text-body-sm text-foreground">
							{totals.permissions}
						</p>
					</div>
					<div>
						<p className="uppercase tracking-[0.2em] text-muted-foreground/70">
							Users
						</p>
						<p className="text-body-sm text-foreground">{totals.users}</p>
					</div>
					<div>
						<p className="uppercase tracking-[0.2em] text-muted-foreground/70">
							Memberships
						</p>
						<p className="text-body-sm text-foreground">
							{totals.memberships}
						</p>
					</div>
				</div>
			</header>

			<section className="grid gap-4">
				<h2 className="text-body-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
					Roles
				</h2>
				{loaderData.roles.length ? (
					<ul className="divide-y divide-border/40">
						{loaderData.roles.map((role) => (
							<li key={role.id} className="py-4">
								<div className="flex flex-wrap items-start justify-between gap-4">
									<div className="grid gap-2">
										<Link
											to={`/admin/roles/${role.id}`}
											className="text-body-sm font-semibold text-foreground transition hover:underline"
										>
											{role.name.replace('_', ' ')}
										</Link>
										{role.description ? (
											<p className="text-body-xs text-muted-foreground">
												{role.description}
											</p>
										) : null}
										<div className="flex flex-wrap gap-2 text-body-xs text-muted-foreground">
											<span className="rounded-full border border-border/60 bg-muted/40 px-2 py-1 text-foreground">
												{role._count.permissions} permissions
											</span>
											<span className="rounded-full border border-border/60 bg-muted/40 px-2 py-1 text-foreground">
												{role._count.users} users
											</span>
											<span className="rounded-full border border-border/60 bg-muted/40 px-2 py-1 text-foreground">
												{role._count.memberships} memberships
											</span>
										</div>
									</div>
									<Link
										to={`/admin/roles/${role.id}`}
										className="text-body-2xs text-muted-foreground hover:text-foreground"
									>
										Edit permissions
									</Link>
								</div>
							</li>
						))}
					</ul>
				) : (
					<p className="text-body-sm text-muted-foreground">
						No roles available.
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
