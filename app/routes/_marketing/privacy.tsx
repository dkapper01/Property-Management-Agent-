export default function PrivacyRoute() {
	return (
		<main className="mx-auto flex max-w-(--reading-column) flex-col gap-8 px-6 py-16 md:px-8">
			<header className="grid gap-3">
				<p className="text-body-2xs text-muted-foreground/70 uppercase tracking-[0.2em]">
					Privacy
				</p>
				<h1 className="text-h3 font-serif tracking-tight md:text-h2">
					Your data, handled with care
				</h1>
				<p className="text-body-sm text-muted-foreground">
					We collect only what we need to operate the platform and protect your
					data with strong security practices.
				</p>
			</header>

			<section className="border-y border-border/40 py-6">
				<h2 className="text-body-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
					Privacy summary
				</h2>
				<p className="mt-2 text-body-xs text-muted-foreground">
					This page is a summary. We’ll publish the full privacy policy before
					launch. If you have questions, reach out to support.
				</p>
			</section>
		</main>
	)
}
