import { Link } from 'react-router'
import { Icon } from '#app/components/ui/icon.tsx'
import { type Route } from './+types/index.ts'

export const meta: Route.MetaFunction = () => [
	{ title: 'OpenClaw PM — AI-Native Property Management' },
	{
		name: 'description',
		content:
			'The AI-native system of record for property managers. Track properties, maintenance, documents, and inventory — with AI agents ready to assist.',
	},
]

export default function Index() {
	return (
		<main className="relative overflow-hidden">
			{/* ── Hero ── */}
			<section className="relative px-6 pb-24 pt-20 md:px-8 md:pb-32 md:pt-28">
				{/* Gradient glow backdrop */}
				<div
					aria-hidden
					className="pointer-events-none absolute -top-32 left-1/2 -z-10 size-[600px] -translate-x-1/2 rounded-full opacity-20 blur-[120px]"
					style={{
						background:
							'radial-gradient(circle, oklch(62% 0.18 250), oklch(55% 0.16 290), transparent 70%)',
					}}
				/>

				<div className="mx-auto max-w-3xl text-center">
					<p className="text-body-2xs font-semibold uppercase tracking-[0.25em] text-accent">
						OpenClaw PM
					</p>
					<h1 className="mt-5 text-h2 font-serif tracking-tight md:text-h1 lg:text-mega">
						A second brain for{' '}
						<span
							className="bg-clip-text text-transparent"
							style={{
								backgroundImage:
									'linear-gradient(135deg, oklch(55% 0.15 250), oklch(55% 0.18 290), oklch(60% 0.16 320))',
							}}
						>
							property ownership
						</span>
						.
					</h1>
					<p className="mx-auto mt-6 max-w-xl text-body-md leading-relaxed text-muted-foreground">
						Store property memory in markdown notes and timelines, then
						let AI agents extract structure, surface risk, and connect
						the dots.
					</p>
					<div className="mt-10 flex flex-wrap items-center justify-center gap-3">
						<Link
							to="/signup"
							className="inline-flex h-12 items-center rounded-xl px-8 text-sm font-semibold text-white shadow-md active:scale-[0.97]"
							style={{
								backgroundImage:
									'linear-gradient(135deg, oklch(50% 0.14 250), oklch(48% 0.16 280))',
							}}
						>
							Get started free
						</Link>
						<a
							href="#features"
							className="inline-flex h-12 items-center rounded-xl border border-border/60 bg-card px-7 text-sm font-medium text-muted-foreground shadow-xs hover:border-accent/40 hover:text-foreground active:scale-[0.97]"
						>
							See how it works
						</a>
					</div>
				</div>

				<div className="mx-auto mt-16 h-px max-w-2xl bg-linear-to-r from-transparent via-border/50 to-transparent" />
			</section>

			{/* ── Features ── */}
			<section
				id="features"
				className="scroll-mt-24 px-6 pb-20 md:px-8"
			>
				<div className="mx-auto max-w-4xl">
					<div className="text-center">
						<p className="text-body-2xs font-semibold uppercase tracking-[0.25em] text-accent">
							What it remembers
						</p>
						<h2 className="mt-3 text-h4 font-serif tracking-tight md:text-h3">
							Every detail, always accessible
						</h2>
					</div>
					<div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{capabilities.map((cap) => (
							<div
								key={cap.label}
								className="group rounded-2xl border border-border/40 bg-card p-6 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-border/60"
							>
								<div
									className="flex size-11 items-center justify-center rounded-xl"
									style={{ background: cap.color }}
								>
									<Icon
										name={cap.icon}
										className="size-5 text-white"
									/>
								</div>
								<p className="mt-4 text-body-sm font-semibold text-foreground">
									{cap.label}
								</p>
								<p className="mt-1.5 text-body-xs leading-relaxed text-muted-foreground">
									{cap.description}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ── How it works ── */}
			<section className="relative px-6 pb-20 md:px-8">
				{/* Subtle background wash */}
				<div
					aria-hidden
					className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full opacity-[0.04]"
					style={{
						background:
							'linear-gradient(180deg, oklch(55% 0.15 250), transparent)',
					}}
				/>

				<div className="mx-auto max-w-4xl">
					<div className="text-center">
						<p className="text-body-2xs font-semibold uppercase tracking-[0.25em] text-accent">
							How it works
						</p>
						<h2 className="mt-3 text-h4 font-serif tracking-tight md:text-h3">
							Three steps to structured memory
						</h2>
					</div>
					<div className="relative mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
						{/* Connecting line (desktop only) */}
						<div
							aria-hidden
							className="pointer-events-none absolute top-12 right-[17%] left-[17%] hidden h-px md:block"
							style={{
								backgroundImage:
									'linear-gradient(90deg, oklch(55% 0.12 250 / 0.3), oklch(55% 0.12 290 / 0.3))',
							}}
						/>
						{steps.map((step) => (
							<div
								key={step.number}
								className="relative rounded-2xl border border-border/40 bg-card p-6 shadow-xs"
							>
								<div
									className="flex size-10 items-center justify-center rounded-xl text-sm font-bold text-white"
									style={{
										backgroundImage:
											'linear-gradient(135deg, oklch(50% 0.14 250), oklch(48% 0.16 280))',
									}}
								>
									{step.number}
								</div>
								<p className="mt-4 text-body-sm font-semibold text-foreground">
									{step.title}
								</p>
								<p className="mt-1.5 text-body-xs leading-relaxed text-muted-foreground">
									{step.description}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ── Built for small portfolios ── */}
			<section className="px-6 pb-20 md:px-8">
				<div className="mx-auto max-w-4xl">
					<div
						className="relative overflow-hidden rounded-2xl border border-border/30 p-8 shadow-sm md:p-10"
						style={{
							background:
								'linear-gradient(135deg, oklch(50% 0.10 250 / 0.06), oklch(50% 0.10 290 / 0.04), oklch(50% 0.10 320 / 0.03))',
						}}
					>
						<div
							aria-hidden
							className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full opacity-10 blur-3xl"
							style={{
								background: 'oklch(55% 0.18 280)',
							}}
						/>
						<p className="text-body-2xs font-semibold uppercase tracking-[0.25em] text-accent">
							Built for small portfolios
						</p>
						<h2 className="mt-3 text-h5 font-serif tracking-tight md:text-h4">
							Calm tools for thoughtful owners
						</h2>
						<p className="mt-3 max-w-lg text-body-sm leading-relaxed text-muted-foreground">
							Designed for owners of 1-20 units who want structured
							memory instead of heavy workflow software. Think less
							spreadsheet, more second brain.
						</p>
						<div className="mt-8 grid grid-cols-3 gap-6">
							{highlights.map((h) => (
								<div key={h.label}>
									<p className="text-body-lg font-bold tabular-nums text-foreground md:text-body-xl">
										{h.value}
									</p>
									<p className="mt-0.5 text-body-2xs text-muted-foreground">
										{h.label}
									</p>
								</div>
							))}
						</div>
					</div>
				</div>
			</section>

			{/* ── Bottom CTA ── */}
			<section className="relative px-6 pb-24 pt-8 md:px-8">
				<div className="mx-auto max-w-4xl">
					<div className="mx-auto h-px max-w-sm bg-linear-to-r from-transparent via-border/40 to-transparent" />
					<div className="pt-16 text-center">
						<h2 className="text-h3 font-serif tracking-tight md:text-h2">
							Ready to remember
							<br className="hidden sm:block" />
							{' '}everything?
						</h2>
						<p className="mx-auto mt-4 max-w-md text-body-sm leading-relaxed text-muted-foreground">
							Create your free account and start building structured
							memory for your properties in minutes.
						</p>
						<div className="mt-8">
							<Link
								to="/signup"
								className="inline-flex h-12 items-center rounded-xl px-10 text-sm font-semibold text-white shadow-md active:scale-[0.97]"
								style={{
									backgroundImage:
										'linear-gradient(135deg, oklch(50% 0.14 250), oklch(48% 0.16 280))',
								}}
							>
								Sign up free
							</Link>
						</div>
						<p className="mt-5 text-body-2xs text-muted-foreground">
							Already have an account?{' '}
							<Link
								to="/login"
								className="font-medium text-accent hover:underline"
							>
								Log in
							</Link>
						</p>
					</div>
				</div>
			</section>
		</main>
	)
}

const capabilities = [
	{
		icon: 'file-text' as const,
		label: 'Properties',
		description:
			'Timeline history, linked assets, and key facts per property — all in one place.',
		color: 'oklch(50% 0.14 250)',
	},
	{
		icon: 'update' as const,
		label: 'Maintenance',
		description:
			'Life-cycle events with risk context, vendor links, and asset impact tracking.',
		color: 'oklch(55% 0.16 35)',
	},
	{
		icon: 'link-2' as const,
		label: 'Documents',
		description:
			'Insurance policies, warranties, receipts, and inspection reports organized by property.',
		color: 'oklch(55% 0.14 155)',
	},
	{
		icon: 'dots-horizontal' as const,
		label: 'Inventory',
		description:
			'Assets, components, and replacements with full purchase and maintenance history.',
		color: 'oklch(55% 0.16 290)',
	},
	{
		icon: 'pencil-1' as const,
		label: 'AI Agents',
		description:
			'Tool-driven insights that surface risk, draft proposals, and connect your property data.',
		color: 'oklch(55% 0.14 330)',
	},
]

const steps = [
	{
		number: '01',
		title: 'Add your properties',
		description:
			'Capture details, purchase history, and markdown notes for each property in your portfolio.',
	},
	{
		number: '02',
		title: 'Track everything',
		description:
			'Log maintenance, leases, finances, and documents into a unified, searchable timeline.',
	},
	{
		number: '03',
		title: 'Let AI connect the dots',
		description:
			'AI agents analyze your data, surface insights, flag risks, and draft proposals automatically.',
	},
]

const highlights = [
	{ value: '1–20', label: 'Units per portfolio' },
	{ value: 'MD', label: 'Markdown-first notes' },
	{ value: 'AI', label: 'Agent-ready from day one' },
]
