import { OpenImgContextProvider } from 'openimg/react'
import {
	data,
	redirect,
	Link,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useLoaderData,
	useMatches,
} from 'react-router'
import { HoneypotProvider } from 'remix-utils/honeypot/react'
import { type Route } from './+types/root.ts'
import appleTouchIconAssetUrl from './assets/favicons/apple-touch-icon.png'
import faviconAssetUrl from './assets/favicons/favicon.svg'
import { GeneralErrorBoundary } from './components/error-boundary.tsx'
import { EpicProgress } from './components/progress-bar.tsx'
import { useToast } from './components/toaster.tsx'
import { Button } from './components/ui/button.tsx'
import { href as iconsHref } from './components/ui/icon.tsx'
import { EpicToaster } from './components/ui/sonner.tsx'
import { WorkspaceLayout } from './components/workspace-layout.tsx'
import {
	ThemeSwitch,
	useOptionalTheme,
	useTheme,
} from './routes/resources/theme-switch.tsx'
import tailwindStyleSheetUrl from './styles/tailwind.css?url'
import { getUserId, logout } from './utils/auth.server.ts'
import { ClientHintCheck, getHints } from './utils/client-hints.tsx'
import { prisma } from './utils/db.server.ts'
import { getEnv } from './utils/env.server.ts'
import { pipeHeaders } from './utils/headers.server.ts'
import { honeypot } from './utils/honeypot.server.ts'
import { combineHeaders, getDomainUrl, getImgSrc } from './utils/misc.tsx'
import { useNonce } from './utils/nonce-provider.ts'
import { type Theme, getTheme } from './utils/theme.server.ts'
import { makeTimings, time } from './utils/timing.server.ts'
import { getToast } from './utils/toast.server.ts'
import { useOptionalUser } from './utils/user.ts'
import { authSessionStorage } from './utils/session.server.ts'

export const links: Route.LinksFunction = () => {
	return [
		// Preload svg sprite as a resource to avoid render blocking
		{ rel: 'preload', href: iconsHref, as: 'image' },
		{
			rel: 'icon',
			href: '/favicon.ico',
			sizes: '48x48',
		},
		{ rel: 'icon', type: 'image/svg+xml', href: faviconAssetUrl },
		{ rel: 'apple-touch-icon', href: appleTouchIconAssetUrl },
		{
			rel: 'manifest',
			href: '/site.webmanifest',
			crossOrigin: 'use-credentials',
		} as const, // necessary to make typescript happy
		{ rel: 'stylesheet', href: tailwindStyleSheetUrl },
	].filter(Boolean)
}

export const meta: Route.MetaFunction = ({ data }) => {
	return [
		{
			title: data
				? 'OpenClaw PM — AI-Native Property Management'
				: 'Error | OpenClaw PM',
		},
		{
			name: 'description',
			content:
				'The AI-native system of record for property managers. Track properties, maintenance, documents, and inventory.',
		},
	]
}

export async function loader({ request }: Route.LoaderArgs) {
	const timings = makeTimings('root loader')
	const userId = await time(() => getUserId(request), {
		timings,
		type: 'getUserId',
		desc: 'getUserId in root',
	})
	const path = new URL(request.url).pathname
	const orgIdMatch = path.match(/^\/orgs\/([^/]+)/)
	const organizationIdFromPath = orgIdMatch ? orgIdMatch[1] : null

	const user = userId
		? await time(
				() =>
					prisma.user.findUnique({
						select: {
							id: true,
							name: true,
							username: true,
							image: { select: { objectKey: true } },
							roles: {
								select: {
									name: true,
									permissions: {
										select: { entity: true, action: true, access: true },
									},
								},
							},
						},
						where: { id: userId },
					}),
				{ timings, type: 'find user', desc: 'find user in root' },
			)
		: null
	const authSession = userId
		? await authSessionStorage.getSession(request.headers.get('cookie'))
		: null
	const lastActiveOrgId =
		authSession && typeof authSession.get('lastActiveOrgId') === 'string'
			? (authSession.get('lastActiveOrgId') as string)
			: null

	const memberships = userId
		? await prisma.membership.findMany({
				where: { userId },
				select: {
					organizationId: true,
					organization: { select: { id: true, name: true } },
					role: {
						select: {
							name: true,
							permissions: {
								select: { entity: true, action: true, access: true },
							},
						},
					},
				},
				orderBy: { organization: { name: 'asc' } },
			})
		: []

	const membershipByOrg = new Map(
		memberships.map((membership) => [
			membership.organizationId,
			membership,
		]),
	)

	const defaultOrgId =
		lastActiveOrgId && membershipByOrg.has(lastActiveOrgId)
			? lastActiveOrgId
			: memberships.length > 0
				? memberships[0]?.organizationId ?? null
				: null

	const activeOrgId =
		organizationIdFromPath && membershipByOrg.has(organizationIdFromPath)
			? organizationIdFromPath
			: null

	const activeMembership = activeOrgId
		? membershipByOrg.get(activeOrgId) ?? null
		: null
	const activeOrg = activeMembership?.organization ?? null

	const canReadDrafts = activeMembership
		? activeMembership.role.permissions.some(
				(permission) =>
					permission.entity === 'draft-change' &&
					permission.action === 'read',
			)
		: false

	const pendingDraftCount =
		activeOrgId && canReadDrafts
			? await prisma.draftChange.count({
					where: { organizationId: activeOrgId, status: 'DRAFT' },
				})
			: 0

	const properties =
		activeOrgId
			? await prisma.property.findMany({
					where: { organizationId: activeOrgId },
					select: { id: true, name: true },
					orderBy: { name: 'asc' },
				})
			: []

	let setCookieHeader: string | null = null
	if (authSession && organizationIdFromPath) {
		const isMember = membershipByOrg.has(organizationIdFromPath)
		if (isMember && lastActiveOrgId !== organizationIdFromPath) {
			authSession.set('lastActiveOrgId', organizationIdFromPath)
			setCookieHeader = await authSessionStorage.commitSession(authSession)
		}
	}

	if (userId && path === '/') {
		if (defaultOrgId) {
			throw redirect(`/orgs/${defaultOrgId}/properties`, {
				headers: setCookieHeader ? { 'set-cookie': setCookieHeader } : undefined,
			})
		}
		throw redirect('/orgs/new', {
			headers: setCookieHeader ? { 'set-cookie': setCookieHeader } : undefined,
		})
	}
	if (userId && !user) {
		console.info('something weird happened')
		// something weird happened... The user is authenticated but we can't find
		// them in the database. Maybe they were deleted? Let's log them out.
		await logout({ request, redirectTo: '/' })
	}
	const { toast, headers: toastHeaders } = await getToast(request)
	const honeyProps = await honeypot.getInputProps()
	const orgs = memberships.map((membership) => membership.organization)

	return data(
		{
			user,
			orgs,
			activeOrg,
			properties,
			pendingDraftCount,
			requestInfo: {
				hints: getHints(request),
				origin: getDomainUrl(request),
				path: new URL(request.url).pathname,
				userPrefs: {
					theme: getTheme(request),
				},
			},
			ENV: getEnv(),
			toast,
			honeyProps,
		},
		{
			headers: combineHeaders(
				{ 'Server-Timing': timings.toString() },
				toastHeaders,
				setCookieHeader ? { 'set-cookie': setCookieHeader } : null,
			),
		},
	)
}

export const headers: Route.HeadersFunction = pipeHeaders

function Document({
	children,
	nonce,
	theme = 'light',
	env = {},
}: {
	children: React.ReactNode
	nonce: string
	theme?: Theme
	env?: Record<string, string | undefined>
}) {
	const allowIndexing = ENV.ALLOW_INDEXING !== 'false'
	return (
		<html lang="en" className={`${theme} h-full overflow-x-hidden`}>
			<head>
				<ClientHintCheck nonce={nonce} />
				<Meta />
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width,initial-scale=1" />
				{allowIndexing ? null : (
					<meta name="robots" content="noindex, nofollow" />
				)}
				<Links />
			</head>
			<body className="bg-background text-foreground">
				{children}
				<script
					nonce={nonce}
					dangerouslySetInnerHTML={{
						__html: `window.ENV = ${JSON.stringify(env)}`,
					}}
				/>
				<ScrollRestoration nonce={nonce} />
				<Scripts nonce={nonce} />
			</body>
		</html>
	)
}

export function Layout({ children }: { children: React.ReactNode }) {
	// if there was an error running the loader, data could be missing
	const data = useLoaderData<typeof loader | null>()
	const nonce = useNonce()
	const theme = useOptionalTheme()
	return (
		<Document nonce={nonce} theme={theme} env={data?.ENV}>
			{children}
		</Document>
	)
}

function App() {
	const data = useLoaderData<typeof loader>()
	const user = useOptionalUser()
	const theme = useTheme()
	const matches = useMatches()
	const isPublicRoute = matches.some(
		(match) =>
			match.id?.startsWith('routes/_marketing') ||
			match.id?.startsWith('routes/_auth'),
	)
	useToast(data.toast)
	const sidebarUser = user
		? {
				id: user.id,
				name: user.name,
				username: user.username,
				isAdmin: user.roles.some((role) => role.name === 'admin'),
			}
		: null

	return (
		<OpenImgContextProvider
			optimizerEndpoint="/resources/images"
			getSrc={getImgSrc}
		>
			{user && !isPublicRoute ? (
				<WorkspaceLayout
					activeOrg={data.activeOrg}
					orgs={data.orgs}
					properties={data.properties}
					pendingDraftCount={data.pendingDraftCount}
					user={sidebarUser}
					userPreference={data.requestInfo.userPrefs.theme}
				>
					<Outlet />
				</WorkspaceLayout>
			) : (
				<div className="flex min-h-screen flex-col justify-between">
					<header className="container py-6">
						<nav className="flex flex-wrap items-center justify-between gap-4 sm:flex-nowrap md:gap-8">
							<Logo />
							{user ? (
								<Link
									to="/orgs"
									className="text-body-2xs text-muted-foreground hover:text-foreground"
								>
									Go to app
								</Link>
							) : (
								<Button asChild variant="default" size="lg">
									<Link to="/login">Log In</Link>
								</Button>
							)}
						</nav>
					</header>

					<div className="flex flex-1 flex-col">
						<Outlet />
					</div>

					<footer className="container border-t border-border/40 py-6">
						<div className="flex flex-wrap items-center justify-between gap-4 text-body-2xs text-muted-foreground">
							<p>
								&copy; {new Date().getFullYear()} OpenClaw PM
							</p>
							<nav className="flex flex-wrap items-center gap-4">
								<Link to="/about" className="hover:text-foreground">
									About
								</Link>
								<Link to="/support" className="hover:text-foreground">
									Support
								</Link>
								<Link to="/privacy" className="hover:text-foreground">
									Privacy
								</Link>
								<Link to="/tos" className="hover:text-foreground">
									Terms
								</Link>
								<ThemeSwitch
									userPreference={data.requestInfo.userPrefs.theme}
								/>
							</nav>
						</div>
					</footer>
				</div>
			)}
			<EpicToaster closeButton position="top-center" theme={theme} />
			<EpicProgress />
		</OpenImgContextProvider>
	)
}

function Logo() {
	return (
		<Link to="/" className="group flex items-center gap-2 leading-snug">
			<svg
				className="text-primary size-7 transition group-hover:scale-110"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
				<polyline points="9 22 9 12 15 12 15 22" />
			</svg>
			<span className="text-foreground text-lg font-bold tracking-tight">
				OpenClaw
				<span className="text-muted-foreground ml-0.5 font-normal">PM</span>
			</span>
		</Link>
	)
}

function AppWithProviders() {
	const data = useLoaderData<typeof loader>()
	return (
		<HoneypotProvider {...data.honeyProps}>
			<App />
		</HoneypotProvider>
	)
}

export default AppWithProviders

// this is a last resort error boundary. There's not much useful information we
// can offer at this level.
export const ErrorBoundary = GeneralErrorBoundary
