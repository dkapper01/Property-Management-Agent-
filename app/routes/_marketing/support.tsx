export default function SupportRoute() {
	return (
		<main className="mx-auto flex max-w-(--reading-column) flex-col gap-8 px-6 py-16 md:px-8">
			<header className="grid gap-3">
				<p className="text-body-2xs text-muted-foreground/70 uppercase tracking-[0.2em]">
					Support
				</p>
				<h1 className="text-h3 font-serif tracking-tight md:text-h2">
					We’re here to help
				</h1>
				<p className="text-body-sm text-muted-foreground">
					Need help with onboarding, maintenance history, or account access?
					Send us a note and we’ll respond quickly.
				</p>
			</header>

			<section className="border-y border-border/40 py-6">
				<h2 className="text-body-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
					Contact support
				</h2>
				<p className="mt-2 text-body-xs text-muted-foreground">
					Email: support@openclawpm.com
				</p>
				<p className="text-body-xs text-muted-foreground">
					We typically respond within one business day.
				</p>
			</section>
		</main>
	)
}
