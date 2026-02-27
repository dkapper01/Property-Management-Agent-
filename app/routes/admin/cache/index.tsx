import { invariantResponse } from '@epic-web/invariant'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import {
	redirect,
	Form,
	Link,
	useFetcher,
	useSearchParams,
	useSubmit,
} from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Field } from '#app/components/forms.tsx'
import {
	cache,
	getAllCacheKeys,
	lruCache,
	searchCacheKeys,
} from '#app/utils/cache.server.ts'
import {
	ensureInstance,
	getAllInstances,
	getInstanceInfo,
} from '#app/utils/litefs.server.ts'
import { useDebounce, useDoubleCheck } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/index.ts'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')
	const searchParams = new URL(request.url).searchParams
	const query = searchParams.get('query')
	if (query === '') {
		searchParams.delete('query')
		return redirect(`/admin/cache?${searchParams.toString()}`)
	}
	const limit = Number(searchParams.get('limit') ?? 100)

	const currentInstanceInfo = await getInstanceInfo()
	const instance =
		searchParams.get('instance') ?? currentInstanceInfo.currentInstance
	const instances = await getAllInstances()
	await ensureInstance(instance)

	let cacheKeys: { sqlite: Array<string>; lru: Array<string> }
	if (typeof query === 'string') {
		cacheKeys = await searchCacheKeys(query, limit)
	} else {
		cacheKeys = await getAllCacheKeys(limit)
	}
	return { cacheKeys, instance, instances, currentInstanceInfo }
}

export async function action({ request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')
	const formData = await request.formData()
	const key = formData.get('cacheKey')
	const { currentInstance } = await getInstanceInfo()
	const instance = formData.get('instance') ?? currentInstance
	const type = formData.get('type')

	invariantResponse(typeof key === 'string', 'cacheKey must be a string')
	invariantResponse(typeof type === 'string', 'type must be a string')
	invariantResponse(typeof instance === 'string', 'instance must be a string')
	await ensureInstance(instance)

	switch (type) {
		case 'sqlite': {
			await cache.delete(key)
			break
		}
		case 'lru': {
			lruCache.delete(key)
			break
		}
		default: {
			throw new Error(`Unknown cache type: ${type}`)
		}
	}
	return { success: true }
}

export default function CacheAdminRoute({ loaderData }: Route.ComponentProps) {
	const [searchParams] = useSearchParams()
	const submit = useSubmit()
	const query = searchParams.get('query') ?? ''
	const limit = searchParams.get('limit') ?? '100'
	const instance = searchParams.get('instance') ?? loaderData.instance

	const handleFormChange = useDebounce(async (form: HTMLFormElement) => {
		await submit(form)
	}, 400)

	return (
		<div className="mx-auto flex max-w-(--reading-column) flex-col gap-8 px-6 py-10 md:px-8">
			<header className="mb-2">
				<p className="text-body-2xs text-muted-foreground/70 uppercase tracking-[0.2em]">
					Admin
				</p>
				<h1 className="text-h4 font-serif tracking-tight">Cache Admin</h1>
				<p className="text-body-2xs text-muted-foreground mt-1">
					Inspect and clear cached entries across instances.
				</p>
				<div className="mt-6 grid gap-4 text-body-2xs text-muted-foreground md:grid-cols-3">
					<div>
						<p className="uppercase tracking-[0.2em] text-muted-foreground/70">
							LRU keys
						</p>
						<p className="text-body-sm text-foreground">
							{loaderData.cacheKeys.lru.length}
						</p>
					</div>
					<div>
						<p className="uppercase tracking-[0.2em] text-muted-foreground/70">
							SQLite keys
						</p>
						<p className="text-body-sm text-foreground">
							{loaderData.cacheKeys.sqlite.length}
						</p>
					</div>
					<div>
						<p className="uppercase tracking-[0.2em] text-muted-foreground/70">
							Total
						</p>
						<p className="text-body-sm text-foreground">
							{loaderData.cacheKeys.sqlite.length +
								loaderData.cacheKeys.lru.length}
						</p>
					</div>
				</div>
			</header>

			<Form
				method="get"
				className="grid gap-4 border-y border-border/40 py-4"
				onChange={(e) => handleFormChange(e.currentTarget)}
			>
				<div className="grid gap-4 lg:grid-cols-[1fr_180px_220px_auto]">
					<Field
						labelProps={{ children: 'Search cache' }}
						inputProps={{
							type: 'search',
							name: 'query',
							defaultValue: query,
							placeholder: 'Search by key',
						}}
					/>
					<Field
						labelProps={{
							children: 'Limit',
						}}
						inputProps={{
							name: 'limit',
							defaultValue: limit,
							type: 'number',
							step: '1',
							min: '1',
							max: '10000',
							placeholder: 'results limit',
						}}
					/>
					<div className="grid gap-1">
						<label className="text-body-xs text-muted-foreground">
							Instance
						</label>
						<select
							name="instance"
							defaultValue={instance}
							className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
						>
							{Object.entries(loaderData.instances).map(([inst, region]) => (
								<option key={inst} value={inst}>
									{[
										inst,
										`(${region})`,
										inst === loaderData.currentInstanceInfo.currentInstance
											? '(current)'
											: '',
										inst === loaderData.currentInstanceInfo.primaryInstance
											? ' (primary)'
											: '',
									]
										.filter(Boolean)
										.join(' ')}
								</option>
							))}
						</select>
					</div>
					<div className="flex items-end justify-end gap-2 pb-2">
						<button
							type="submit"
							className="text-body-2xs text-muted-foreground transition hover:text-foreground"
						>
							Search
						</button>
					</div>
				</div>
			</Form>

			<section className="grid gap-4">
				<h2 className="text-body-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
					LRU Cache
				</h2>
				<ul className="divide-y divide-border/40">
					{loaderData.cacheKeys.lru.map((key) => (
						<li key={key} className="py-3">
							<CacheKeyRow
								cacheKey={key}
								instance={instance}
								type="lru"
							/>
						</li>
					))}
				</ul>
			</section>

			<section className="grid gap-4">
				<h2 className="text-body-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
					SQLite Cache
				</h2>
				<ul className="divide-y divide-border/40">
					{loaderData.cacheKeys.sqlite.map((key) => (
						<li key={key} className="py-3">
							<CacheKeyRow
								cacheKey={key}
								instance={instance}
								type="sqlite"
							/>
						</li>
					))}
				</ul>
			</section>
		</div>
	)
}

function CacheKeyRow({
	cacheKey,
	instance,
	type,
}: {
	cacheKey: string
	instance?: string
	type: 'sqlite' | 'lru'
}) {
	const fetcher = useFetcher<typeof action>()
	const dc = useDoubleCheck()
	const encodedKey = encodeURIComponent(cacheKey)
	const valuePage = `/admin/cache/${type}/${encodedKey}?instance=${instance}`
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 font-mono">
			<fetcher.Form method="POST">
				<input type="hidden" name="cacheKey" value={cacheKey} />
				<input type="hidden" name="instance" value={instance} />
				<input type="hidden" name="type" value={type} />
				<button
					className="text-body-2xs text-muted-foreground transition hover:text-foreground"
					{...dc.getButtonProps({ type: 'submit' })}
				>
					{fetcher.state === 'idle'
						? dc.doubleCheck
							? 'You sure?'
							: 'Delete'
						: 'Deleting...'}
				</button>
			</fetcher.Form>
			<Link
				reloadDocument
				to={valuePage}
				className="text-body-xs text-muted-foreground transition hover:text-foreground"
			>
				{cacheKey}
			</Link>
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
