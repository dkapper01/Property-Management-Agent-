-- AlterTable
ALTER TABLE "MaintenanceRequest" ADD COLUMN "capexOpex" TEXT DEFAULT 'UNKNOWN';
ALTER TABLE "MaintenanceRequest" ADD COLUMN "classificationConfidence" REAL;
ALTER TABLE "MaintenanceRequest" ADD COLUMN "classificationSource" TEXT;
ALTER TABLE "MaintenanceRequest" ADD COLUMN "expectedFailureDate" DATETIME;

-- CreateTable
CREATE TABLE "McpToolInvocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "method" TEXT NOT NULL,
    "paramsHash" TEXT,
    "resultSummary" TEXT,
    "status" TEXT,
    "durationMs" INTEGER,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT,
    "actorLabel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "McpToolInvocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "McpToolInvocation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DraftChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "operations" JSONB NOT NULL,
    "validation" JSONB,
    "agentContext" JSONB,
    "proposedByType" TEXT,
    "proposedByUserId" TEXT,
    "proposedByLabel" TEXT,
    "reasoningSummary" TEXT,
    "confidence" REAL,
    "sourceTool" TEXT,
    "sourceRunId" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "reviewedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "appliedAt" DATETIME,
    CONSTRAINT "DraftChange_proposedByUserId_fkey" FOREIGN KEY ("proposedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DraftChange_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DraftChange_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DraftChange_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DraftChange" ("agentContext", "appliedAt", "createdAt", "createdByUserId", "entityId", "entityType", "id", "operations", "organizationId", "reviewedAt", "reviewedByUserId", "status", "summary", "title", "validation") SELECT "agentContext", "appliedAt", "createdAt", "createdByUserId", "entityId", "entityType", "id", "operations", "organizationId", "reviewedAt", "reviewedByUserId", "status", "summary", "title", "validation" FROM "DraftChange";
DROP TABLE "DraftChange";
ALTER TABLE "new_DraftChange" RENAME TO "DraftChange";
CREATE INDEX "DraftChange_organizationId_idx" ON "DraftChange"("organizationId");
CREATE INDEX "DraftChange_createdByUserId_idx" ON "DraftChange"("createdByUserId");
CREATE INDEX "DraftChange_proposedByUserId_idx" ON "DraftChange"("proposedByUserId");
CREATE INDEX "DraftChange_reviewedByUserId_idx" ON "DraftChange"("reviewedByUserId");
CREATE INDEX "DraftChange_status_idx" ON "DraftChange"("status");
CREATE INDEX "DraftChange_entityType_entityId_idx" ON "DraftChange"("entityType", "entityId");
CREATE INDEX "DraftChange_sourceTool_idx" ON "DraftChange"("sourceTool");
CREATE INDEX "DraftChange_sourceRunId_idx" ON "DraftChange"("sourceRunId");
CREATE TABLE "new_EntityNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'markdown',
    "noteType" TEXT NOT NULL DEFAULT 'NOTE',
    "aiSummary" TEXT,
    "aiSummaryUpdatedAt" DATETIME,
    "aiMetadata" JSONB,
    "decisionMetadata" JSONB,
    "organizationId" TEXT NOT NULL,
    "createdByType" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EntityNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EntityNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_EntityNote" ("aiMetadata", "aiSummary", "aiSummaryUpdatedAt", "content", "createdAt", "createdById", "createdByType", "entityId", "entityType", "format", "id", "organizationId", "title", "updatedAt") SELECT "aiMetadata", "aiSummary", "aiSummaryUpdatedAt", "content", "createdAt", "createdById", "createdByType", "entityId", "entityType", "format", "id", "organizationId", "title", "updatedAt" FROM "EntityNote";
DROP TABLE "EntityNote";
ALTER TABLE "new_EntityNote" RENAME TO "EntityNote";
CREATE INDEX "EntityNote_organizationId_idx" ON "EntityNote"("organizationId");
CREATE INDEX "EntityNote_entityType_entityId_idx" ON "EntityNote"("entityType", "entityId");
CREATE INDEX "EntityNote_createdById_idx" ON "EntityNote"("createdById");
CREATE TABLE "new_TimelineEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "propertyId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "maintenanceRequestId" TEXT,
    "documentId" TEXT,
    "entityNoteId" TEXT,
    "leaseId" TEXT,
    "assetId" TEXT,
    "actorId" TEXT,
    "actorType" TEXT,
    "actorLabel" TEXT,
    "actorMetadata" JSONB,
    "draftChangeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimelineEvent_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_maintenanceRequestId_fkey" FOREIGN KEY ("maintenanceRequestId") REFERENCES "MaintenanceRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_entityNoteId_fkey" FOREIGN KEY ("entityNoteId") REFERENCES "EntityNote" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_draftChangeId_fkey" FOREIGN KEY ("draftChangeId") REFERENCES "DraftChange" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TimelineEvent" ("actorId", "assetId", "createdAt", "documentId", "entityNoteId", "id", "leaseId", "maintenanceRequestId", "message", "metadata", "organizationId", "propertyId", "type") SELECT "actorId", "assetId", "createdAt", "documentId", "entityNoteId", "id", "leaseId", "maintenanceRequestId", "message", "metadata", "organizationId", "propertyId", "type" FROM "TimelineEvent";
DROP TABLE "TimelineEvent";
ALTER TABLE "new_TimelineEvent" RENAME TO "TimelineEvent";
CREATE INDEX "TimelineEvent_propertyId_idx" ON "TimelineEvent"("propertyId");
CREATE INDEX "TimelineEvent_organizationId_idx" ON "TimelineEvent"("organizationId");
CREATE INDEX "TimelineEvent_maintenanceRequestId_idx" ON "TimelineEvent"("maintenanceRequestId");
CREATE INDEX "TimelineEvent_documentId_idx" ON "TimelineEvent"("documentId");
CREATE INDEX "TimelineEvent_entityNoteId_idx" ON "TimelineEvent"("entityNoteId");
CREATE INDEX "TimelineEvent_leaseId_idx" ON "TimelineEvent"("leaseId");
CREATE INDEX "TimelineEvent_assetId_idx" ON "TimelineEvent"("assetId");
CREATE INDEX "TimelineEvent_actorId_idx" ON "TimelineEvent"("actorId");
CREATE INDEX "TimelineEvent_draftChangeId_idx" ON "TimelineEvent"("draftChangeId");
CREATE INDEX "TimelineEvent_type_idx" ON "TimelineEvent"("type");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "McpToolInvocation_organizationId_idx" ON "McpToolInvocation"("organizationId");

-- CreateIndex
CREATE INDEX "McpToolInvocation_actorId_idx" ON "McpToolInvocation"("actorId");

-- CreateIndex
CREATE INDEX "McpToolInvocation_actorType_idx" ON "McpToolInvocation"("actorType");

-- CreateIndex
CREATE INDEX "McpToolInvocation_method_idx" ON "McpToolInvocation"("method");

-- CreateIndex
CREATE INDEX "McpToolInvocation_createdAt_idx" ON "McpToolInvocation"("createdAt");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_capexOpex_idx" ON "MaintenanceRequest"("capexOpex");
