-- CreateTable
CREATE TABLE "EntityNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'markdown',
    "organizationId" TEXT NOT NULL,
    "createdByType" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EntityNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EntityNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EntityNote_organizationId_idx" ON "EntityNote"("organizationId");

-- CreateIndex
CREATE INDEX "EntityNote_entityType_entityId_idx" ON "EntityNote"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "EntityNote_createdById_idx" ON "EntityNote"("createdById");
