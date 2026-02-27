-- CreateTable
CREATE TABLE "DomainEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "source" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DomainEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DomainEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "payload" JSONB,
    "result" JSONB,
    "errorMessage" TEXT,
    "source" TEXT,
    "requestedByType" TEXT NOT NULL,
    "requestedByIdentifier" TEXT,
    "requestedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "executedById" TEXT,
    "executedAt" DATETIME,
    "organizationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkItem_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkItem_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkItem_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DomainEvent_organizationId_idx" ON "DomainEvent"("organizationId");

-- CreateIndex
CREATE INDEX "DomainEvent_type_idx" ON "DomainEvent"("type");

-- CreateIndex
CREATE INDEX "DomainEvent_entityType_entityId_idx" ON "DomainEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "DomainEvent_actorId_idx" ON "DomainEvent"("actorId");

-- CreateIndex
CREATE INDEX "WorkItem_organizationId_idx" ON "WorkItem"("organizationId");

-- CreateIndex
CREATE INDEX "WorkItem_status_idx" ON "WorkItem"("status");

-- CreateIndex
CREATE INDEX "WorkItem_action_idx" ON "WorkItem"("action");

-- CreateIndex
CREATE INDEX "WorkItem_entityType_entityId_idx" ON "WorkItem"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "WorkItem_requestedById_idx" ON "WorkItem"("requestedById");

-- CreateIndex
CREATE INDEX "WorkItem_approvedById_idx" ON "WorkItem"("approvedById");

-- CreateIndex
CREATE INDEX "WorkItem_executedById_idx" ON "WorkItem"("executedById");
