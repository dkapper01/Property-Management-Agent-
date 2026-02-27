import { searchUsers } from '@prisma/client/sql'
import { Img } from 'openimg/react'
import { redirect, Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList } from '#app/components/forms.tsx'
import { SearchBar } from '#app/components/search-bar.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { cn, getUserImgSrc, useDelayedIsPending } from '#app/utils/misc.tsx'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const searchTerm = new URL(request.url).searchParams.get('search')
	if (searchTerm === '') {
		return redirect('/users')
	}

	const like = `%${searchTerm ?? ''}%`
	const users = await prisma.$queryRawTyped(searchUsers(like))
	return { status: 'idle', users } as const
}

export default function UsersRoute({ loaderData }: Route.ComponentProps) {
	const isPending = useDelayedIsPending({
		formMethod: 'GET',
		formAction: '/users',
	})

	return (
		<div className="mx-auto flex max-w-(--reading-column) flex-col gap-8 px-6 py-10 md:px-8">
			<header className="mb-2">
				<p className="text-body-2xs text-muted-foreground/70 uppercase tracking-[0.2em]">
					Directory
				</p>
				<h1 className="text-h4 font-serif tracking-tight">People</h1>
				<p className="text-body-2xs text-muted-foreground mt-1">
					Search for users across the platform.
				</p>
			</header>

			<section className="border-y border-border/40 py-4">
				<div className="max-w-xl">
					<SearchBar status={loaderData.status} autoFocus autoSubmit />
				</div>
			</section>

			<main>
				{loaderData.status === 'idle' ? (
					loaderData.users.length ? (
						<ul
							className={cn(
								'divide-y divide-border/40',
								{ 'opacity-50': isPending },
							)}
						>
							{loaderData.users.map((user) => (
								<li key={user.id} className="py-3">
									<Link
										to={user.username}
										className="flex items-center gap-4 text-left transition hover:text-foreground"
										aria-label={`${user.name || user.username} profile`}
									>
										<Img
											alt={user.name ?? user.username}
											src={getUserImgSrc(user.imageObjectKey)}
											className="size-10 rounded-full"
											width={256}
											height={256}
										/>
										<div className="grid gap-1">
											{user.name ? (
												<span className="text-body-sm font-semibold text-foreground">
													{user.name}
												</span>
											) : null}
											<span className="text-body-xs text-muted-foreground">
												@{user.username}
											</span>
										</div>
									</Link>
								</li>
							))}
						</ul>
					) : (
						<p className="text-body-sm text-muted-foreground">No users found.</p>
					)
				) : loaderData.status === 'error' ? (
					<ErrorList errors={['There was an error parsing the results']} />
				) : null}
			</main>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
