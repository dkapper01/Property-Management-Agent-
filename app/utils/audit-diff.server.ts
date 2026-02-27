import { type Prisma } from '@prisma/client'

export type AuditDiff = {
	path: string
	before: Prisma.InputJsonValue | null
	after: Prisma.InputJsonValue | null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeValue(value: Prisma.InputJsonValue | null | undefined) {
	return value === undefined ? null : value
}

export function diffAuditValues({
	before,
	after,
	path = '',
}: {
	before: Prisma.InputJsonValue | null | undefined
	after: Prisma.InputJsonValue | null | undefined
	path?: string
}): AuditDiff[] {
	const normalizedBefore = normalizeValue(before)
	const normalizedAfter = normalizeValue(after)

	if (isPlainObject(normalizedBefore) && isPlainObject(normalizedAfter)) {
		const beforeRecord = normalizedBefore as Record<string, Prisma.InputJsonValue>
		const afterRecord = normalizedAfter as Record<string, Prisma.InputJsonValue>
		const keys = new Set([
			...Object.keys(beforeRecord),
			...Object.keys(afterRecord),
		])
		const diffs: AuditDiff[] = []
		for (const key of keys) {
			diffs.push(
				...diffAuditValues({
					before: beforeRecord[key],
					after: afterRecord[key],
					path: path ? `${path}.${key}` : key,
				}),
			)
		}
		return diffs
	}

	const beforeString = JSON.stringify(normalizedBefore)
	const afterString = JSON.stringify(normalizedAfter)
	if (beforeString === afterString) return []

	return [
		{
			path: path || '(root)',
			before: normalizedBefore ?? null,
			after: normalizedAfter ?? null,
		},
	]
}
