export default function TermsOfServiceRoute() {
	return (
		<main className="mx-auto flex max-w-(--reading-column) flex-col gap-8 px-6 py-16 md:px-8">
			<header className="grid gap-3">
				<p className="text-body-2xs text-muted-foreground/70 uppercase tracking-[0.2em]">
					Terms
				</p>
				<h1 className="text-h3 font-serif tracking-tight md:text-h2">
					Terms of service
				</h1>
				<p className="text-body-sm text-muted-foreground">
					These terms govern the use of OpenClaw PM. We’ll publish the full
					terms before launch.
				</p>
			</header>

			<section className="border-y border-border/40 py-6">
				<h2 className="text-body-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
					Terms overview
				</h2>
				<p className="mt-2 text-body-xs text-muted-foreground">
					This page is a summary. If you have questions about usage, billing,
					or data, contact support.
				</p>
			</section>
		</main>
	)
}
