import { invariantResponse } from '@epic-web/invariant'
import { Img } from 'openimg/react'
import {
	type LoaderFunctionArgs,
	Form,
	Link,
	useLoaderData,
} from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { getUserImgSrc } from '#app/utils/misc.tsx'
import { useOptionalUser } from '#app/utils/user.ts'
import { type Route } from './+types/index.ts'

export async function loader({ params }: LoaderFunctionArgs) {
	const user = await prisma.user.findFirst({
		select: {
			id: true,
			name: true,
			username: true,
			createdAt: true,
			image: { select: { id: true, objectKey: true } },
		},
		where: {
			username: params.username,
		},
	})

	invariantResponse(user, 'User not found', { status: 404 })

	return { user, userJoinedDisplay: user.createdAt.toLocaleDateString() }
}

export default function ProfileRoute() {
	const data = useLoaderData<typeof loader>()
	const user = data.user
	const userDisplayName = user.name ?? user.username
	const loggedInUser = useOptionalUser()
	const isLoggedInUser = user.id === loggedInUser?.id

	return (
		<div className="mx-auto flex max-w-(--reading-column) flex-col gap-8 px-6 py-10 md:px-8">
			<header className="mb-2">
				<p className="text-body-2xs text-muted-foreground/70 uppercase tracking-[0.2em]">
					Profile
				</p>
				<h1 className="text-h4 font-serif tracking-tight">{userDisplayName}</h1>
				<p className="text-body-2xs text-muted-foreground mt-1">
					Joined {data.userJoinedDisplay}
				</p>
			</header>

			<section className="border-y border-border/40 py-6">
				<div className="flex flex-wrap items-center gap-6">
					<Img
						src={getUserImgSrc(data.user.image?.objectKey)}
						alt={userDisplayName}
						className="size-20 rounded-full object-cover"
						width={320}
						height={320}
					/>
					<div className="grid gap-1">
						<p className="text-body-sm font-semibold text-foreground">
							{userDisplayName}
						</p>
						<p className="text-body-xs text-muted-foreground">
							@{user.username}
						</p>
					</div>
				</div>

				<div className="mt-6 flex flex-wrap gap-4 text-body-2xs text-muted-foreground">
					{isLoggedInUser ? (
						<>
							<Link to="notes" prefetch="intent" className="hover:text-foreground">
								My notes
							</Link>
							<Link
								to="/settings/profile"
								prefetch="intent"
								className="hover:text-foreground"
							>
								Edit profile
							</Link>
							<Form action="/logout" method="POST">
								<button
									type="submit"
									className="text-body-2xs text-muted-foreground hover:text-foreground"
								>
									Logout
								</button>
							</Form>
						</>
					) : (
						<Link
							to="notes"
							prefetch="intent"
							className="hover:text-foreground"
						>
							{userDisplayName}'s notes
						</Link>
					)}
				</div>
			</section>
		</div>
	)
}

export const meta: Route.MetaFunction = ({ data, params }) => {
	const displayName = data?.user.name ?? params.username
	return [
		{ title: `${displayName} | Epic Notes` },
		{
			name: 'description',
			content: `Profile of ${displayName} on Epic Notes`,
		},
	]
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: ({ params }) => (
					<p>No user with the username "{params.username}" exists</p>
				),
			}}
		/>
	)
}
