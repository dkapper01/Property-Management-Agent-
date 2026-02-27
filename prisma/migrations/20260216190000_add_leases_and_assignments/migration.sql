-- CreateTable
CREATE TABLE "Lease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lease_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Lease_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lease_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Backfill leases from existing tenants
INSERT INTO "Lease" ("id", "propertyId", "unitId", "userId", "status", "startDate", "endDate", "createdAt", "updatedAt")
SELECT "id", "propertyId", "unitId", "userId", 'ACTIVE', "createdAt", NULL, "createdAt", "updatedAt"
FROM "Tenant";

-- DropTable
DROP TABLE "Tenant";

-- CreateTable
CREATE TABLE "PropertyAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PropertyAssignment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PropertyAssignment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
ALTER TABLE "MaintenanceRequest" ADD COLUMN "requestedByUserId" TEXT REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "Lease_propertyId_userId_startDate_key" ON "Lease"("propertyId", "userId", "startDate");

-- CreateIndex
CREATE INDEX "Lease_propertyId_idx" ON "Lease"("propertyId");

-- CreateIndex
CREATE INDEX "Lease_unitId_idx" ON "Lease"("unitId");

-- CreateIndex
CREATE INDEX "Lease_userId_idx" ON "Lease"("userId");

-- CreateIndex
CREATE INDEX "Lease_status_idx" ON "Lease"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyAssignment_propertyId_membershipId_key" ON "PropertyAssignment"("propertyId", "membershipId");

-- CreateIndex
CREATE INDEX "PropertyAssignment_propertyId_idx" ON "PropertyAssignment"("propertyId");

-- CreateIndex
CREATE INDEX "PropertyAssignment_membershipId_idx" ON "PropertyAssignment"("membershipId");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_requestedByUserId_idx" ON "MaintenanceRequest"("requestedByUserId");
