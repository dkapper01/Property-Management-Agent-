// This is called a "splat route" and as it's in the root `/app/routes/`
// directory, it's a catchall. If no other routes match, this one will and we
// can know that the user is hitting a URL that doesn't exist. By throwing a
// 404 from the loader, we can force the error boundary to render which will
// ensure the user gets the right status code and we can display a nicer error
// message for them than the Remix and/or browser default.

import { Link, useLocation } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'

export function loader() {
	throw new Response('Not found', { status: 404 })
}

export function action() {
	throw new Response('Not found', { status: 404 })
}

export default function NotFound() {
	// due to the loader, this component will never be rendered, but we'll return
	// the error boundary just in case.
	return <ErrorBoundary />
}

export function ErrorBoundary() {
	const location = useLocation()
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: () => (
					<div className="mx-auto flex max-w-(--reading-column) flex-col gap-8 px-6 py-10 md:px-8">
						<header className="mb-2">
							<p className="text-body-2xs text-muted-foreground/70 uppercase tracking-[0.2em]">
								Not found
							</p>
							<h1 className="text-h4 font-serif tracking-tight">
								We can’t find that page
							</h1>
							<p className="text-body-2xs text-muted-foreground mt-1">
								The link may be broken or the page may have moved.
							</p>
						</header>
						<section className="border-y border-border/40 py-4">
							<p className="text-body-2xs text-muted-foreground/70 uppercase tracking-[0.2em]">
								Requested path
							</p>
							<pre className="text-body-sm break-all whitespace-pre-wrap text-foreground mt-2">
								{location.pathname}
							</pre>
							<Link
								to="/"
								className="text-body-2xs mt-4 inline-flex text-muted-foreground hover:text-foreground"
							>
								Back to home
							</Link>
						</section>
					</div>
				),
			}}
		/>
	)
}
