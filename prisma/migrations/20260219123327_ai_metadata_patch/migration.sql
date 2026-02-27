-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "actorLabel" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "actorMetadata" JSONB;
ALTER TABLE "AuditLog" ADD COLUMN "actorType" TEXT;

-- AlterTable
ALTER TABLE "McpToolInvocation" ADD COLUMN "actorMetadata" JSONB;
