export default function AboutRoute() {
	return (
		<main className="mx-auto flex max-w-(--reading-column) flex-col gap-8 px-6 py-16 md:px-8">
			<header className="grid gap-3">
				<p className="text-body-2xs text-muted-foreground/70 uppercase tracking-[0.2em]">
					About
				</p>
				<h1 className="text-h3 font-serif tracking-tight md:text-h2">
					Building calm memory for property owners
				</h1>
				<p className="text-body-sm text-muted-foreground">
					OpenClaw PM organizes property memory so owners and AI agents can
					reason together — without the noise of traditional workflow software.
				</p>
			</header>

			<section className="border-y border-border/40 py-6">
				<h2 className="text-body-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
					Why we’re here
				</h2>
				<p className="mt-2 text-body-xs text-muted-foreground">
					Property ownership creates a lifetime of decisions, documents, and
					maintenance history. We’re building a structured memory system that
					keeps that context alive and useful.
				</p>
			</section>
		</main>
	)
}
