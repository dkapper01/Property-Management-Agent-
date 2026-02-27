PRAGMA foreign_keys=OFF;

-- Drop tables no longer used in the lean system of record
DROP TABLE IF EXISTS "MaintenanceRequestAttachment";
DROP TABLE IF EXISTS "PropertyAssignment";
DROP TABLE IF EXISTS "Document";
DROP TABLE IF EXISTS "Asset";
DROP TABLE IF EXISTS "Vendor";
DROP TABLE IF EXISTS "TimelineEvent";
DROP TABLE IF EXISTS "DomainEvent";
DROP TABLE IF EXISTS "WorkItem";

-- Redefine Membership without vendor references
CREATE TABLE "new_Membership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Membership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Membership" ("id", "organizationId", "userId", "roleId", "createdAt", "updatedAt")
SELECT "id", "organizationId", "userId", "roleId", "createdAt", "updatedAt"
FROM "Membership";

DROP TABLE "Membership";
ALTER TABLE "new_Membership" RENAME TO "Membership";

CREATE UNIQUE INDEX "Membership_organizationId_userId_key" ON "Membership"("organizationId", "userId");
CREATE INDEX "Membership_organizationId_idx" ON "Membership"("organizationId");
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");
CREATE INDEX "Membership_roleId_idx" ON "Membership"("roleId");

-- Redefine MaintenanceRequest with image keys and without asset/vendor/priority columns
CREATE TABLE "new_MaintenanceRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "category" TEXT,
    "source" TEXT NOT NULL DEFAULT 'WEB',
    "sourceThreadId" TEXT,
    "accessNotes" TEXT,
    "imageKeys" JSONB,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "requestedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MaintenanceRequest_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceRequest_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_MaintenanceRequest" (
    "id",
    "title",
    "description",
    "status",
    "category",
    "source",
    "sourceThreadId",
    "accessNotes",
    "imageKeys",
    "propertyId",
    "unitId",
    "requestedByUserId",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "title",
    "description",
    "status",
    "category",
    "source",
    "sourceThreadId",
    "accessNotes",
    NULL as "imageKeys",
    "propertyId",
    "unitId",
    "requestedByUserId",
    "createdAt",
    "updatedAt"
FROM "MaintenanceRequest";

DROP TABLE "MaintenanceRequest";
ALTER TABLE "new_MaintenanceRequest" RENAME TO "MaintenanceRequest";

CREATE INDEX "MaintenanceRequest_propertyId_idx" ON "MaintenanceRequest"("propertyId");
CREATE INDEX "MaintenanceRequest_unitId_idx" ON "MaintenanceRequest"("unitId");
CREATE INDEX "MaintenanceRequest_requestedByUserId_idx" ON "MaintenanceRequest"("requestedByUserId");
CREATE INDEX "MaintenanceRequest_category_idx" ON "MaintenanceRequest"("category");
CREATE INDEX "MaintenanceRequest_source_idx" ON "MaintenanceRequest"("source");
CREATE INDEX "MaintenanceRequest_sourceThreadId_idx" ON "MaintenanceRequest"("sourceThreadId");

PRAGMA foreign_keys=ON;
