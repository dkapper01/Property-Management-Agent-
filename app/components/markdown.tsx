import { cn } from '#app/utils/misc.tsx'

type MarkdownBlock =
	| { type: 'heading'; level: number; content: string }
	| { type: 'paragraph'; content: string }
	| { type: 'list'; ordered: boolean; items: string[] }
	| { type: 'blockquote'; content: string[] }
	| { type: 'code'; content: string }

type InlineToken =
	| { type: 'text'; value: string }
	| { type: 'code'; value: string }
	| { type: 'bold'; value: string }
	| { type: 'italic'; value: string }
	| { type: 'link'; value: string; href: string }
	| { type: 'wikilink'; value: string }

function isBlockStart(line: string) {
	const trimmed = line.trim()
	return (
		trimmed.startsWith('```') ||
		/^#{1,3}\s+/.test(trimmed) ||
		/^>\s?/.test(trimmed) ||
		/^(\-|\*)\s+/.test(trimmed) ||
		/^\d+\.\s+/.test(trimmed)
	)
}

function isSafeLink(href: string) {
	if (
		href.startsWith('/') ||
		href.startsWith('#') ||
		href.startsWith('./') ||
		href.startsWith('../')
	) {
		return true
	}
	try {
		const url = new URL(href)
		return ['http:', 'https:', 'mailto:'].includes(url.protocol)
	} catch {
		return false
	}
}

function tokenizeInline(content: string) {
	const tokens: InlineToken[] = []
	let remaining = content

	const patterns = [
		{ type: 'code', regex: /`([^`]+)`/ },
		{ type: 'bold', regex: /\*\*([^*]+)\*\*/ },
		{ type: 'wikilink', regex: /\[\[([^\]]+)\]\]/ },
		{ type: 'link', regex: /\[([^\]]+)\]\(([^)]+)\)/ },
		{ type: 'italic', regex: /\*([^*]+)\*/ },
	] as const

	while (remaining) {
		let earliestIndex = -1
		let matchedPattern: (typeof patterns)[number] | null = null
		let matchedGroups: RegExpMatchArray | null = null

		for (const pattern of patterns) {
			const match = remaining.match(pattern.regex)
			if (!match || match.index === undefined) continue
			if (
				earliestIndex === -1 ||
				match.index < earliestIndex ||
				(match.index === earliestIndex &&
					patterns.indexOf(pattern) <
						(matchedPattern ? patterns.indexOf(matchedPattern) : 0))
			) {
				earliestIndex = match.index
				matchedPattern = pattern
				matchedGroups = match
			}
		}

		if (!matchedPattern || !matchedGroups || earliestIndex === -1) {
			tokens.push({ type: 'text', value: remaining })
			break
		}

		if (earliestIndex > 0) {
			tokens.push({ type: 'text', value: remaining.slice(0, earliestIndex) })
		}

		switch (matchedPattern.type) {
			case 'code':
				tokens.push({ type: 'code', value: matchedGroups[1] ?? '' })
				break
			case 'bold':
				tokens.push({ type: 'bold', value: matchedGroups[1] ?? '' })
				break
			case 'italic':
				tokens.push({ type: 'italic', value: matchedGroups[1] ?? '' })
				break
			case 'wikilink':
				tokens.push({ type: 'wikilink', value: matchedGroups[1] ?? '' })
				break
			case 'link':
				tokens.push({
					type: 'link',
					value: matchedGroups[1] ?? '',
					href: matchedGroups[2] ?? '',
				})
				break
			default:
				break
		}

		remaining = remaining.slice(
			(earliestIndex ?? 0) + matchedGroups[0].length,
		)
	}

	return tokens
}

function renderInline(content: string) {
	return tokenizeInline(content).map((token, index) => {
		switch (token.type) {
			case 'wikilink':
				return (
					<span
						key={index}
						className="text-accent cursor-default"
					>
						[[{token.value}]]
					</span>
				)
			case 'code':
				return (
					<code
						key={index}
						className="rounded border border-border/20 bg-muted/50 px-1.5 py-0.5 font-mono text-[0.8em]"
					>
						{token.value}
					</code>
				)
			case 'bold':
				return (
					<strong key={index} className="font-semibold">
						{token.value}
					</strong>
				)
			case 'italic':
				return (
					<em key={index} className="italic">
						{token.value}
					</em>
				)
			case 'link': {
				if (!isSafeLink(token.href)) {
					return (
						<span key={index}>
							[{token.value}]({token.href})
						</span>
					)
				}
				return (
					<a
						key={index}
						href={token.href}
						target="_blank"
						rel="noreferrer"
						className="text-accent underline-offset-2 hover:underline"
					>
						{token.value}
					</a>
				)
			}
			default:
				return <span key={index}>{token.value}</span>
		}
	})
}

function parseMarkdownBlocks(content: string) {
	const blocks: MarkdownBlock[] = []
	const lines = content.split(/\r?\n/)
	let index = 0

	while (index < lines.length) {
		const line = lines[index] ?? ''
		const trimmed = line.trim()

		if (!trimmed) {
			index += 1
			continue
		}

		if (trimmed.startsWith('```')) {
			const codeLines: string[] = []
			index += 1
			while (index < lines.length && !lines[index]?.trim().startsWith('```')) {
				codeLines.push(lines[index] ?? '')
				index += 1
			}
			if (index < lines.length) index += 1
			blocks.push({ type: 'code', content: codeLines.join('\n') })
			continue
		}

		const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/)
		if (headingMatch) {
			const [, hashes = '', text = ''] = headingMatch
			blocks.push({
				type: 'heading',
				level: hashes.length,
				content: text,
			})
			index += 1
			continue
		}

		if (/^>\s?/.test(trimmed)) {
			const quoteLines: string[] = []
			while (index < lines.length && /^>\s?/.test(lines[index] ?? '')) {
				quoteLines.push((lines[index] ?? '').replace(/^>\s?/, ''))
				index += 1
			}
			blocks.push({ type: 'blockquote', content: quoteLines })
			continue
		}

		if (/^(\-|\*)\s+/.test(trimmed)) {
			const items: string[] = []
			while (index < lines.length && /^(\-|\*)\s+/.test(lines[index] ?? '')) {
				items.push((lines[index] ?? '').replace(/^(\-|\*)\s+/, ''))
				index += 1
			}
			blocks.push({ type: 'list', ordered: false, items })
			continue
		}

		if (/^\d+\.\s+/.test(trimmed)) {
			const items: string[] = []
			while (index < lines.length && /^\d+\.\s+/.test(lines[index] ?? '')) {
				items.push((lines[index] ?? '').replace(/^\d+\.\s+/, ''))
				index += 1
			}
			blocks.push({ type: 'list', ordered: true, items })
			continue
		}

		const paragraphLines: string[] = []
		while (
			index < lines.length &&
			(lines[index] ?? '').trim() !== '' &&
			!isBlockStart(lines[index] ?? '')
		) {
			paragraphLines.push(lines[index] ?? '')
			index += 1
		}
		blocks.push({ type: 'paragraph', content: paragraphLines.join(' ') })
	}

	return blocks
}

export function MarkdownPreview({
	content,
	className,
}: {
	content: string
	className?: string
}) {
	const blocks = parseMarkdownBlocks(content)
	return (
		<div className={cn('grid gap-4', className)}>
			{blocks.map((block, index) => {
				switch (block.type) {
					case 'heading': {
						const Heading =
							block.level === 1
								? 'h3'
								: block.level === 2
									? 'h4'
									: 'h5'
						const headingClass =
							block.level === 1
								? 'text-body-lg font-semibold font-serif'
								: block.level === 2
									? 'text-body-md font-semibold font-serif'
									: 'text-body-sm font-semibold'
						return (
							<Heading
								key={index}
								className={cn(headingClass, index > 0 && 'mt-4')}
							>
								{renderInline(block.content)}
							</Heading>
						)
					}
					case 'list': {
						const List = block.ordered ? 'ol' : 'ul'
						return (
							<List
								key={index}
								className={cn(
									'space-y-1.5 pl-5 text-body-sm leading-[1.7] text-foreground/90',
									block.ordered ? 'list-decimal' : 'list-disc',
								)}
							>
								{block.items.map((item, itemIndex) => (
									<li key={itemIndex}>{renderInline(item)}</li>
								))}
							</List>
						)
					}
				case 'blockquote':
					return (
						<blockquote
							key={index}
							className="border-l-2 border-accent/20 bg-accent/3 rounded-r-lg px-4 py-3 text-body-sm leading-[1.7] text-muted-foreground"
						>
							{renderInline(block.content.join(' '))}
						</blockquote>
					)
				case 'code':
					return (
						<pre
							key={index}
							className="overflow-x-auto rounded-lg border border-border/30 bg-muted/30 px-4 py-3.5 font-mono text-body-xs leading-relaxed"
						>
							<code>{block.content}</code>
						</pre>
					)
				default:
					return (
						<p key={index} className="text-body-sm leading-[1.7] text-foreground/90">
							{renderInline(block.content)}
						</p>
					)
				}
			})}
		</div>
	)
}
