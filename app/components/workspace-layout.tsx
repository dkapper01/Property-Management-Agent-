import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router'
import { type Theme } from '#app/utils/theme.server.ts'
import { WorkspaceSidebar } from './workspace-sidebar.tsx'

type WorkspaceProperty = {
	id: string
	name: string
}

type WorkspaceOrg = {
	id: string
	name: string
}

type WorkspaceUser = {
	id: string
	name: string | null
	username: string
	isAdmin: boolean
}

type WorkspaceLayoutProps = {
	activeOrg: WorkspaceOrg | null
	orgs: WorkspaceOrg[]
	properties: WorkspaceProperty[]
	pendingDraftCount: number
	user: WorkspaceUser | null
	userPreference?: Theme | null
	children: React.ReactNode
}

export function WorkspaceLayout({
	activeOrg,
	orgs,
	properties,
	pendingDraftCount,
	user,
	userPreference,
	children,
}: WorkspaceLayoutProps) {
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
	const [mobileOpen, setMobileOpen] = useState(false)
	const location = useLocation()

	useEffect(() => {
		setMobileOpen(false)
	}, [location.pathname])

	const handleKeyDown = useCallback((e: KeyboardEvent) => {
		if (e.key === '\\' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault()
			setSidebarCollapsed((prev) => !prev)
		}
	}, [])

	useEffect(() => {
		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [handleKeyDown])

	return (
		<div className="flex h-screen overflow-hidden bg-background text-foreground">
			{/* Mobile hamburger */}
			<button
				onClick={() => setMobileOpen(true)}
				className="text-muted-foreground hover:text-foreground fixed top-3 left-3 z-40 rounded-md p-2 md:hidden"
				aria-label="Open sidebar"
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

			{/* Mobile overlay */}
			{mobileOpen ? (
				<div className="fixed inset-0 z-50 md:hidden">
					<div
						className="absolute inset-0 bg-black/40 backdrop-blur-sm"
						onClick={() => setMobileOpen(false)}
					/>
					<div className="relative h-full w-(--sidebar-width) animate-slide-left">
						<WorkspaceSidebar
							activeOrg={activeOrg}
							orgs={orgs}
							properties={properties}
							pendingDraftCount={pendingDraftCount}
							user={user}
							userPreference={userPreference}
							collapsed={false}
							onToggle={() => setMobileOpen(false)}
						/>
					</div>
				</div>
			) : null}

			{/* Desktop sidebar */}
			<div className="hidden transition-all duration-200 ease-out md:block">
				<WorkspaceSidebar
					activeOrg={activeOrg}
					orgs={orgs}
					properties={properties}
					pendingDraftCount={pendingDraftCount}
					user={user}
					userPreference={userPreference}
					collapsed={sidebarCollapsed}
					onToggle={() => setSidebarCollapsed((prev) => !prev)}
				/>
			</div>

			<main className="flex-1 overflow-y-auto scroll-smooth scroll-pt-8 bg-background transition-colors">
				{children}
			</main>
		</div>
	)
}
