-- CreateTable
CREATE TABLE "DraftChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "operations" JSONB NOT NULL,
    "validation" JSONB,
    "agentContext" JSONB,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "reviewedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "appliedAt" DATETIME,
    CONSTRAINT "DraftChange_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DraftChange_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DraftChange_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DraftChange_organizationId_idx" ON "DraftChange"("organizationId");

-- CreateIndex
CREATE INDEX "DraftChange_createdByUserId_idx" ON "DraftChange"("createdByUserId");

-- CreateIndex
CREATE INDEX "DraftChange_reviewedByUserId_idx" ON "DraftChange"("reviewedByUserId");

-- CreateIndex
CREATE INDEX "DraftChange_status_idx" ON "DraftChange"("status");

-- CreateIndex
CREATE INDEX "DraftChange_entityType_entityId_idx" ON "DraftChange"("entityType", "entityId");
