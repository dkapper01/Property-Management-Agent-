import { invariantResponse } from '@epic-web/invariant'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Link, Outlet, useMatches } from 'react-router'
import { z } from 'zod'
import { Icon } from '#app/components/ui/icon.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { cn } from '#app/utils/misc.tsx'
import { useUser } from '#app/utils/user.ts'
import { type Route } from './+types/_layout.tsx'

export const BreadcrumbHandle = z.object({ breadcrumb: z.any() })
export type BreadcrumbHandle = z.infer<typeof BreadcrumbHandle>

export const handle: BreadcrumbHandle & SEOHandle = {
	breadcrumb: <Icon name="file-text">Edit Profile</Icon>,
	getSitemapEntries: () => null,
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { username: true },
	})
	invariantResponse(user, 'User not found', { status: 404 })
	return {}
}

const BreadcrumbHandleMatch = z.object({
	handle: BreadcrumbHandle,
})

export default function EditUserProfile() {
	const user = useUser()
	const matches = useMatches()
	const breadcrumbs = matches
		.map((m) => {
			const result = BreadcrumbHandleMatch.safeParse(m)
			if (!result.success || !result.data.handle.breadcrumb) return null
			return (
				<Link key={m.id} to={m.pathname} className="flex items-center">
					{result.data.handle.breadcrumb}
				</Link>
			)
		})
		.filter(Boolean)

	return (
		<div className="mx-auto flex max-w-(--reading-column) flex-col gap-8 px-6 py-10 md:px-8">
			<header className="mb-2">
				<ul className="flex flex-wrap items-center gap-3 text-body-2xs text-muted-foreground">
					<li>
						<Link
							to={`/users/${user.username}`}
							className="hover:text-foreground"
						>
							Profile
						</Link>
					</li>
					{breadcrumbs.map((breadcrumb, i, arr) => (
						<li
							key={i}
							className={cn('flex items-center gap-2', {
								'text-muted-foreground': i < arr.length - 1,
							})}
						>
							<span className="text-muted-foreground/40">/</span>
							<span className="text-muted-foreground">{breadcrumb}</span>
						</li>
					))}
				</ul>
				<p className="text-body-2xs text-muted-foreground/70 mt-6 uppercase tracking-[0.2em]">
					Settings
				</p>
				<h1 className="text-h4 font-serif tracking-tight">Profile settings</h1>
				<p className="text-body-2xs text-muted-foreground mt-1">
					Manage your account details, security, and connections.
				</p>
			</header>
			<main className="border-y border-border/40 py-6">
				<Outlet />
			</main>
		</div>
	)
}
