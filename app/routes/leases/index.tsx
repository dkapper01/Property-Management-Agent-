import { Link } from 'react-router'
import { type Route } from './+types/index.ts'

export async function loader() {
	return null
}

export default function TenantPortal() {
	return (
		<div className="mx-auto max-w-(--reading-column) px-6 py-12 md:px-8">
			<h1 className="text-h4 font-serif tracking-tight">Tenant portal</h1>
			<p className="text-body-sm text-muted-foreground mt-3">
				The tenant portal is de-emphasized in V1 while we focus on the
				property owner second brain. Reach out to your property team for support.
			</p>
			<Link
				to="/orgs"
				className="mt-6 inline-flex text-body-2xs text-muted-foreground hover:text-foreground"
			>
				Back to portfolio
			</Link>
		</div>
	)
}

export function ErrorBoundary() {
	return null
}
