import { useState, useMemo } from 'react'
import { Form, Link, NavLink, useLocation } from 'react-router'
import { cn } from '#app/utils/misc.tsx'
import { Icon } from './ui/icon.tsx'
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
} from './ui/dropdown-menu.tsx'
import {
	ThemeSwitch,
} from '#app/routes/resources/theme-switch.tsx'
import { type Theme } from '#app/utils/theme.server.ts'

type SidebarProperty = {
	id: string
	name: string
}

type SidebarOrg = {
	id: string
	name: string
}

type SidebarUser = {
	id: string
	name: string | null
	username: string
	isAdmin: boolean
}

type WorkspaceSidebarProps = {
	activeOrg: SidebarOrg | null
	orgs: SidebarOrg[]
	properties: SidebarProperty[]
	pendingDraftCount: number
	user: SidebarUser | null
	userPreference?: Theme | null
	collapsed: boolean
	onToggle: () => void
}

const sidebarNavLinkClass = ({ isActive }: { isActive: boolean }) =>
	cn(
		'relative flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium tracking-[0.01em]',
		isActive
			? 'bg-accent/10 text-foreground before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-4 before:w-[3px] before:rounded-full before:bg-accent'
			: 'text-muted-foreground hover:bg-foreground/4 hover:text-foreground',
	)

const propertySublinkClass = (isActive: boolean) =>
	cn(
		'block rounded-md px-2.5 py-0.5 text-[11px] tracking-[0.01em]',
		isActive
			? 'text-accent font-medium'
			: 'text-muted-foreground hover:text-foreground',
	)

const PROPERTY_SECTIONS = [
	{ id: 'timeline', label: 'Timeline', icon: 'clock' },
	{ id: 'notes', label: 'Notes', icon: 'file-text' },
	{ id: 'finances', label: 'Financials', icon: 'dots-horizontal' },
	{ id: 'documents', label: 'Documents', icon: 'file-text' },
	{ id: 'maintenance', label: 'Maintenance', icon: 'update' },
	{ id: 'assets', label: 'Assets', icon: 'link-2' },
	{ id: 'leases', label: 'Leases', icon: 'avatar' },
] as const

const MCP_DISMISSED_KEY = 'openclaw-mcp-callout-dismissed'

function useMcpDismissed() {
	const [dismissed, setDismissed] = useState(() => {
		if (typeof window === 'undefined') return false
		try {
			return localStorage.getItem(MCP_DISMISSED_KEY) === '1'
		} catch {
			return false
		}
	})

	function dismiss() {
		setDismissed(true)
		try {
			localStorage.setItem(MCP_DISMISSED_KEY, '1')
		} catch {
			// localStorage unavailable
		}
	}

	return [dismissed, dismiss] as const
}

export function WorkspaceSidebar({
	activeOrg,
	orgs,
	properties,
	pendingDraftCount,
	user,
	userPreference,
	collapsed,
	onToggle,
}: WorkspaceSidebarProps) {
	const location = useLocation()
	const activeOrgId = activeOrg?.id ?? null
	const [expandedProperties, setExpandedProperties] = useState<Set<string>>(
		() => {
			const match = location.pathname.match(
				/\/orgs\/[^/]+\/properties\/([^/]+)/,
			)
			return match?.[1] ? new Set([match[1]]) : new Set()
		},
	)
	const [propertyFilter, setPropertyFilter] = useState('')
	const [mcpDismissed, dismissMcp] = useMcpDismissed()

	const filteredProperties = useMemo(() => {
		if (!propertyFilter.trim()) return properties
		const q = propertyFilter.toLowerCase()
		return properties.filter((p) => p.name.toLowerCase().includes(q))
	}, [properties, propertyFilter])

	const toggleProperty = (id: string) => {
		setExpandedProperties((prev) => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}

	const baseUrl = activeOrgId ? `/orgs/${activeOrgId}` : '/orgs'

	if (collapsed) {
		return (
			<aside className="bg-sidebar border-border/40 flex h-screen w-12 flex-col items-center border-r py-3">
				<div className="mb-4 flex flex-col items-center gap-3">
					<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							className="flex size-7 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent"
							aria-label="Switch workspace"
							title={activeOrg?.name ?? 'Select workspace'}
						>
							{activeOrg?.name?.[0]?.toUpperCase() ?? 'W'}
						</button>
					</DropdownMenuTrigger>
						<DropdownMenuContent side="right" align="start">
							{orgs.length ? (
								orgs.map((org) => (
									<DropdownMenuItem key={org.id} asChild>
										<Link to={`/orgs/${org.id}/properties`}>{org.name}</Link>
									</DropdownMenuItem>
								))
							) : (
								<DropdownMenuItem disabled>No workspaces yet</DropdownMenuItem>
							)}
							<DropdownMenuSeparator />
							<DropdownMenuItem asChild>
								<Link to="/orgs">All workspaces</Link>
							</DropdownMenuItem>
							<DropdownMenuItem asChild>
								<Link to="/orgs/new">Create workspace</Link>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					<button
						onClick={onToggle}
						className="text-muted-foreground hover:text-foreground rounded-md p-1"
						aria-label="Expand sidebar"
						title="Expand sidebar (⌘\)"
					>
						<svg
							className="size-5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<path d="M3 12h18M3 6h18M3 18h18" />
						</svg>
					</button>
				</div>
				<nav className="flex flex-col items-center gap-1.5">
					{activeOrgId ? (
						<>
							<NavLink
								to={`${baseUrl}/properties`}
								className={({ isActive }) =>
									cn(
										'rounded-lg p-2',
										isActive
											? 'bg-accent/10 text-foreground'
											: 'text-muted-foreground hover:bg-foreground/4 hover:text-foreground',
									)
								}
								title="Properties"
							>
								<svg
									className="size-4"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
								>
									<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
								</svg>
							</NavLink>
							<NavLink
								to={`${baseUrl}/notes`}
								className={({ isActive }) =>
									cn(
										'rounded-lg p-2',
										isActive
											? 'bg-accent/10 text-foreground'
											: 'text-muted-foreground hover:bg-foreground/4 hover:text-foreground',
									)
								}
								title="All notes"
							>
								<Icon name="file-text" size="sm" />
							</NavLink>
							<NavLink
								to={`${baseUrl}/finances`}
								className={({ isActive }) =>
									cn(
										'rounded-lg p-2',
										isActive
											? 'bg-accent/10 text-foreground'
											: 'text-muted-foreground hover:bg-foreground/4 hover:text-foreground',
									)
								}
								title="All financials"
							>
								<Icon name="dots-horizontal" size="sm" />
							</NavLink>
							<NavLink
								to={`${baseUrl}/drafts`}
								className={({ isActive }) =>
									cn(
										'relative rounded-lg p-2',
										isActive
											? 'bg-accent/10 text-foreground'
											: 'text-muted-foreground hover:bg-foreground/4 hover:text-foreground',
									)
								}
								title="Drafts"
							>
								<Icon name="pencil-1" size="sm" />
								{pendingDraftCount > 0 ? (
									<span className="bg-accent text-accent-foreground absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full text-[9px] font-bold">
										{pendingDraftCount}
									</span>
								) : null}
							</NavLink>
						</>
					) : (
						<NavLink
							to="/orgs"
							className={({ isActive }) =>
								cn(
									'rounded-lg p-2',
									isActive
										? 'bg-accent/10 text-foreground'
										: 'text-muted-foreground hover:bg-foreground/4 hover:text-foreground',
								)
							}
							title="Workspaces"
						>
							<svg
								className="size-4"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
							>
								<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
							</svg>
						</NavLink>
					)}
				</nav>
				<div className="mt-auto">
					<ThemeSwitch userPreference={userPreference} />
				</div>
			</aside>
		)
	}

	return (
		<aside className="bg-sidebar border-border/40 flex h-screen w-(--sidebar-width) flex-col border-r">
			{/* Workspace header */}
			<div className="px-4 py-3">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2.5">
						<span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-[11px] font-bold text-accent">
							{activeOrg?.name?.[0]?.toUpperCase() ?? 'W'}
						</span>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									className="text-foreground flex w-full items-center gap-1.5 truncate text-sm font-semibold tracking-tight"
									aria-label="Switch workspace"
								>
									<span className="truncate">
										{activeOrg?.name ?? 'Select workspace'}
									</span>
									<svg
										className="size-3 text-muted-foreground"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
									>
										<path d="M6 9l6 6 6-6" />
									</svg>
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start">
								{orgs.length ? (
									orgs.map((org) => (
										<DropdownMenuItem key={org.id} asChild>
											<Link to={`/orgs/${org.id}/properties`}>
												{org.name}
											</Link>
										</DropdownMenuItem>
									))
								) : (
									<DropdownMenuItem disabled>No workspaces yet</DropdownMenuItem>
								)}
								<DropdownMenuSeparator />
								<DropdownMenuItem asChild>
									<Link to="/orgs">All workspaces</Link>
								</DropdownMenuItem>
								<DropdownMenuItem asChild>
									<Link to="/orgs/new">Create workspace</Link>
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
					<button
						onClick={onToggle}
						className="text-muted-foreground hover:text-foreground -mr-1 rounded-md p-1 transition-colors"
						aria-label="Collapse sidebar"
						title="Collapse sidebar (⌘\)"
					>
						<svg
							className="size-4"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<path d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
						</svg>
					</button>
				</div>
			</div>
			<div className="mx-4 h-px bg-linear-to-r from-border/60 via-border/30 to-transparent" />

			<nav className="flex-1 overflow-y-auto px-2 py-3">
				{activeOrgId ? (
					<>
						{/* Properties section with search */}
						<div className="mb-5">
							<div className="flex items-center justify-between px-2.5">
								<Link
									to={`${baseUrl}/properties`}
									className="text-muted-foreground/60 text-[10px] font-semibold tracking-[0.22em] uppercase hover:text-foreground"
								>
									Properties
								</Link>
								{properties.length > 0 ? (
									<span className="text-[10px] tabular-nums text-muted-foreground/50">
										{properties.length}
									</span>
								) : null}
							</div>

							{properties.length > 2 ? (
								<div className="mt-1.5 px-1">
									<input
										type="text"
										value={propertyFilter}
										onChange={(e) => setPropertyFilter(e.target.value)}
										placeholder="Find property..."
										className="w-full rounded-md border border-border/30 bg-background/50 px-2.5 py-1 text-[11px] placeholder:text-muted-foreground/50 focus:border-accent/40 focus:outline-none"
									/>
								</div>
							) : null}

							{filteredProperties.length > 0 ? (
								<ul className="mt-1.5 space-y-0">
									{filteredProperties.map((property) => {
										const isExpanded = expandedProperties.has(property.id)
										const propertyUrl = `${baseUrl}/properties/${property.id}`
										const isPropertyActive =
											location.pathname.startsWith(propertyUrl)

										return (
											<li key={property.id}>
												<div className="flex items-center">
													<button
														onClick={() => toggleProperty(property.id)}
														className="text-muted-foreground hover:text-foreground shrink-0 rounded-md p-1 transition-colors"
														aria-label={
															isExpanded
																? `Collapse ${property.name}`
																: `Expand ${property.name}`
														}
													>
														<svg
															className={cn(
																'size-3 transition-transform',
																isExpanded && 'rotate-90',
															)}
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															strokeWidth="2.5"
														>
															<polyline points="9 18 15 12 9 6" />
														</svg>
													</button>
													<NavLink
														to={propertyUrl}
														end
														className={({ isActive }) =>
															cn(
																'flex flex-1 items-center gap-1.5 truncate rounded-md px-1.5 py-0.5 text-[12px] font-medium transition-colors',
																isActive || isPropertyActive
																	? 'text-foreground'
																	: 'text-muted-foreground hover:text-foreground',
															)
														}
													>
														<span className="flex size-5 shrink-0 items-center justify-center rounded bg-accent/8 text-[9px] font-bold text-accent">
															{property.name[0]?.toUpperCase()}
														</span>
														<span className="truncate">{property.name}</span>
													</NavLink>
												</div>
												{isExpanded ? (
													<div className="border-accent/20 ml-4 space-y-0.5 border-l pl-2 pt-0.5">
														{PROPERTY_SECTIONS.map((section) => {
															const href = `${propertyUrl}#${section.id}`
															const isSectionActive =
																isPropertyActive &&
																(location.hash === `#${section.id}` ||
																	(!location.hash &&
																		section.id === 'timeline'))

															return (
																<Link
																	key={section.id}
																	to={href}
																	className={propertySublinkClass(
																		isSectionActive,
																	)}
																>
																	<Icon
																		name={section.icon}
																		size="xs"
																		className="mr-1.5"
																	/>
																	{section.label}
																</Link>
															)
														})}
													</div>
												) : null}
											</li>
										)
									})}
								</ul>
							) : properties.length > 0 ? (
								<p className="text-[11px] text-muted-foreground/60 px-2.5 py-2">
									No matches.
								</p>
							) : (
								<p className="text-body-xs text-muted-foreground px-2.5 py-2">
									No properties yet.
								</p>
							)}
						</div>

						<div className="mt-6">
							<div className="mb-1.5">
								<span className="text-muted-foreground/60 px-2.5 text-[10px] font-semibold tracking-[0.22em] uppercase">
									Portfolio
								</span>
							</div>

							<NavLink to={`${baseUrl}/notes`} className={sidebarNavLinkClass}>
								<Icon name="file-text" size="sm" className="shrink-0" />
								All Notes
							</NavLink>

							<NavLink
								to={`${baseUrl}/finances`}
								className={sidebarNavLinkClass}
							>
								<Icon name="dots-horizontal" size="sm" className="shrink-0" />
								All Financials
							</NavLink>

							<NavLink to={`${baseUrl}/drafts`} className={sidebarNavLinkClass}>
								<Icon name="pencil-1" size="sm" className="shrink-0" />
								Drafts
								{pendingDraftCount > 0 ? (
									<span className="bg-accent/15 text-accent ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none">
										{pendingDraftCount}
									</span>
								) : null}
							</NavLink>

							<NavLink to={`${baseUrl}/vendors`} className={sidebarNavLinkClass}>
								<Icon name="avatar" size="sm" className="shrink-0" />
								Vendors
							</NavLink>

							<NavLink to={`${baseUrl}/members`} className={sidebarNavLinkClass}>
								<Icon name="avatar" size="sm" className="shrink-0" />
								Collaborators
							</NavLink>
						</div>
					</>
				) : (
					<div className="px-2.5 py-2 text-body-xs text-muted-foreground">
						Select a workspace to see your portfolio.
					</div>
				)}
			</nav>

			{/* MCP callout */}
			{!mcpDismissed && activeOrgId ? (
				<div className="px-3 pb-2">
					<div className="relative rounded-lg border border-accent/20 bg-accent/5 p-3">
						<button
							onClick={dismissMcp}
							className="absolute top-1.5 right-1.5 rounded p-0.5 text-muted-foreground/60 hover:text-foreground"
							aria-label="Dismiss"
						>
							<svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
								<path d="M18 6L6 18M6 6l12 12" />
							</svg>
						</button>
						<p className="text-[11px] font-semibold text-accent">
							MCP Compatible
						</p>
						<p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
							Connect your AI tools for the best results.
						</p>
						<Link
							to="/settings/profile"
							className="mt-1.5 inline-block text-[10px] font-medium text-accent hover:underline"
						>
							Learn more →
						</Link>
					</div>
				</div>
			) : null}

			{/* Account section */}
			<div className="mx-3 h-px bg-linear-to-r from-border/60 via-border/30 to-transparent" />
			<div className="px-3 py-3 text-body-2xs text-muted-foreground">
				<div className="flex items-center justify-between">
					<span className="uppercase tracking-[0.2em] text-muted-foreground/70">
						Account
					</span>
					<ThemeSwitch userPreference={userPreference} />
				</div>
				{user ? (
					<div className="mt-2 grid gap-0.5">
						<Link
							to={`/users/${user.username}`}
							className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:text-foreground"
						>
							<Icon name="avatar" size="xs" className="opacity-50" />
							Profile
						</Link>
						<Link to="/settings/profile" className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:text-foreground">
							<Icon name="pencil-1" size="xs" className="opacity-50" />
							Settings
						</Link>
						{user.isAdmin ? (
							<Link to="/admin/users" className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:text-foreground">
								<Icon name="lock-open-1" size="xs" className="opacity-50" />
								Admin
							</Link>
						) : null}
						<Form action="/logout" method="POST">
							<button
								type="submit"
								className="flex items-center gap-2 rounded-md px-1 py-0.5 text-body-2xs text-muted-foreground hover:text-foreground"
							>
								<Icon name="exit" size="xs" className="opacity-50" />
								Logout
							</button>
						</Form>
					</div>
				) : null}
			</div>
		</aside>
	)
}
