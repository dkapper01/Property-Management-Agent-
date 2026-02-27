import { Link } from 'react-router'
import { Icon, type IconName } from './ui/icon.tsx'

type EmptyStateProps = {
	icon?: IconName
	title: string
	description?: string
	actionLabel?: string
	actionTo?: string
}

export function EmptyState({
	icon,
	title,
	description,
	actionLabel,
	actionTo,
}: EmptyStateProps) {
	return (
		<div className="rounded-xl border border-dashed border-border/60 bg-surface px-6 py-14 text-center">
			{icon ? (
				<div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-accent/10">
					<Icon name={icon} className="size-6 text-accent" />
				</div>
			) : null}
			<p className="text-body-md font-medium text-foreground">{title}</p>
			{description ? (
				<p className="mx-auto mt-1.5 max-w-xs text-body-2xs leading-relaxed text-muted-foreground/80">
					{description}
				</p>
			) : null}
			{actionLabel && actionTo ? (
				<Link
					to={actionTo}
					className="mt-5 inline-block rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 text-body-2xs font-medium text-accent hover:bg-accent/15"
				>
					{actionLabel}
				</Link>
			) : null}
		</div>
	)
}
