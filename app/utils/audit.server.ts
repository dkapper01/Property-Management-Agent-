import {
	Prisma,
	type ActorType,
	type AuditAction,
	type PrismaClient,
} from '@prisma/client'
import { prisma } from './db.server.ts'

type DbClient = Prisma.TransactionClient | PrismaClient

type AuditPayload = {
	organizationId: string
	actorId: string | null
	actorType?: ActorType | null
	actorLabel?: string | null
	actorMetadata?: Prisma.InputJsonValue | null
	action: AuditAction
	entityType: string
	entityId: string
	before?: Prisma.InputJsonValue | null
	after?: Prisma.InputJsonValue | null
}

export async function writeAuditLog({
	organizationId,
	actorId,
	actorType,
	actorLabel,
	actorMetadata,
	action,
	entityType,
	entityId,
	before,
	after,
}: AuditPayload, client: DbClient = prisma) {
	const normalizeJson = (value?: Prisma.InputJsonValue | null) =>
		value === undefined ? undefined : value === null ? Prisma.DbNull : value
	const resolvedActorType = actorType ?? (actorId ? 'USER' : 'SYSTEM')
	return client.auditLog.create({
		data: {
			organizationId,
			actorId,
			actorType: resolvedActorType,
			actorLabel: actorLabel ?? undefined,
			actorMetadata: normalizeJson(actorMetadata),
			action,
			entityType,
			entityId,
			before: normalizeJson(before),
			after: normalizeJson(after),
		},
	})
}
