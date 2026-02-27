import { data, Form } from 'react-router'
import { z } from 'zod'
import { MarkdownPreview } from '#app/components/markdown.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { prisma } from '#app/utils/db.server.ts'
import {
	assertMembershipPermission,
	requireMembership,
} from '#app/utils/membership.server.ts'
import { type Route } from './+types/index.ts'

const QuerySchema = z.object({
	q: z.string().optional(),
})

function extractTitle(body: string) {
	const firstLine = body.split('\n').find(Boolean)
	if (!firstLine) return 'Note'
	return firstLine.replace(/^#+\s*/, '').slice(0, 60)
}

export async function loader({ params, request }: Route.LoaderArgs) {
	const organizationId = params.orgId
	if (!organizationId) {
		throw new Response('Workspace not found', { status: 404 })
	}

	const membership = await requireMembership(request, organizationId)
	assertMembershipPermission(membership, 'read:entity-note:any')

	const url = new URL(request.url)
	const { q } = QuerySchema.parse({
		q: url.searchParams.get('q') ?? undefined,
	})

	const notes = await prisma.entityNote.findMany({
		where: {
			organizationId,
			...(q
				? {
						OR: [{ body: { contains: q } }],
					}
				: {}),
		},
		select: {
			id: true,
			body: true,
			tags: true,
			isDecisionNote: true,
			createdAt: true,
			entityType: true,
			entityId: true,
			createdBy: { select: { id: true, name: true, username: true } },
		},
		orderBy: { createdAt: 'desc' },
	})

	const propertyIds = notes
		.filter((note) => note.entityType === 'property')
		.map((note) => note.entityId)
	const properties = propertyIds.length
		? await prisma.property.findMany({
				where: { id: { in: propertyIds }, organizationId },
				select: { id: true, name: true },
			})
		: []
	const propertyById = Object.fromEntries(
		properties.map((property) => [property.id, property]),
	)

	return data({
		organizationId,
		membership,
		notes,
		query: q ?? '',
		propertyById,
	})
}

export default function WorkspaceNotes({ loaderData }: Route.ComponentProps) {
	const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' })

	return (
		<article className="mx-auto max-w-(--reading-column) px-5 py-8 md:px-8">
			<header className="mb-8">
				<h1 className="text-h4 font-serif tracking-tight">Notes</h1>
				<p className="text-body-2xs text-muted-foreground mt-1">
					{loaderData.notes.length} notes
				</p>
				<div className="mt-4 h-px bg-linear-to-r from-border/60 via-border/30 to-transparent" />
			</header>

			<Form method="get" className="mb-6 flex flex-wrap items-center gap-3">
				<input
					type="search"
					name="q"
					defaultValue={loaderData.query}
					placeholder="Search notes..."
					className="border border-border/40 bg-card placeholder:text-muted-foreground/40 flex-1 rounded-lg px-3.5 py-2.5 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/40"
				/>
				<StatusButton type="submit" variant="ghost" size="sm" status="idle">
					Filter
				</StatusButton>
			</Form>

			{loaderData.notes.length ? (
				<div className="space-y-3">
					{loaderData.notes.map((note) => {
						const property =
							note.entityType === 'property'
								? loaderData.propertyById[note.entityId]
								: null
						const tags = Array.isArray(note.tags)
							? note.tags.filter((tag) => typeof tag === 'string')
							: []
						return (
							<div
								key={note.id}
								className={`relative overflow-hidden rounded-xl border bg-card p-5 shadow-xs ${
									note.isDecisionNote
										? 'border-amber-500/30'
										: 'border-border/40'
								}`}
							>
								{note.isDecisionNote ? (
									<div className="absolute inset-x-0 top-0 h-[2px] bg-amber-500" />
								) : null}
								<div className="mb-3 flex flex-wrap items-start justify-between gap-2">
									<div className="space-y-1">
										<div className="flex items-center gap-2">
											<p className="text-body-sm font-medium font-serif">
												{extractTitle(note.body)}
											</p>
											{note.isDecisionNote ? (
												<span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-body-2xs font-medium text-amber-600 dark:text-amber-400">
													Decision
												</span>
											) : null}
										</div>
										<p className="text-body-2xs text-muted-foreground/60">
											{note.createdBy?.name ??
												note.createdBy?.username ??
												'System'}{' '}
											· {dateFormatter.format(note.createdAt)}
										</p>
										{property ? (
											<p className="text-body-xs text-accent">
												[[{property.name}]]
											</p>
										) : null}
									</div>
									{tags.length > 0 ? (
										<div className="flex flex-wrap gap-1">
											{tags.map((tag) => (
												<span
													key={tag}
													className="text-body-2xs rounded-full bg-accent/10 px-2 py-0.5 font-medium text-accent"
												>
													#{tag}
												</span>
											))}
										</div>
									) : null}
								</div>

								<div className="text-body-sm leading-relaxed">
									<MarkdownPreview content={note.body} />
								</div>
							</div>
						)
					})}
				</div>
			) : (
				<div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
					<p className="text-body-sm text-muted-foreground">
						No notes yet.
					</p>
				</div>
			)}
		</article>
	)
}
