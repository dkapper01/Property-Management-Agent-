-- DropIndex
DROP INDEX "EntityNoteLink_targetEntityType_targetEntityId_idx";

-- DropIndex
DROP INDEX "EntityNoteLink_noteId_idx";

-- DropIndex
DROP INDEX "EntityNoteTag_tagId_idx";

-- DropIndex
DROP INDEX "MaintenanceRequest_vendorStatus_idx";

-- DropIndex
DROP INDEX "MaintenanceRequest_sourceThreadId_idx";

-- DropIndex
DROP INDEX "MaintenanceRequest_source_idx";

-- DropIndex
DROP INDEX "MaintenanceRequest_capexOpex_idx";

-- DropIndex
DROP INDEX "MaintenanceRequest_severity_idx";

-- DropIndex
DROP INDEX "MaintenanceRequest_category_idx";

-- DropIndex
DROP INDEX "MaintenanceRequest_requestedByUserId_idx";

-- DropIndex
DROP INDEX "MaintenanceRequest_assignedVendorId_idx";

-- DropIndex
DROP INDEX "MaintenanceRequest_assetId_idx";

-- DropIndex
DROP INDEX "MaintenanceRequest_unitId_idx";

-- DropIndex
DROP INDEX "MaintenanceRequest_propertyId_idx";

-- DropIndex
DROP INDEX "NoteTag_organizationId_idx";

-- DropIndex
DROP INDEX "NoteTag_organizationId_name_key";

-- DropIndex
DROP INDEX "Unit_propertyId_name_idx";

-- DropIndex
DROP INDEX "Unit_propertyId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "EntityNoteLink";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "EntityNoteTag";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MaintenanceRequest";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "NoteTag";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Unit";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "MaintenanceEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dateReported" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "cost" REAL,
    "imageKeys" JSONB,
    "propertyId" TEXT NOT NULL,
    "assetId" TEXT,
    "vendorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MaintenanceEvent_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceEvent_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceEvent_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetType" TEXT NOT NULL DEFAULT 'OTHER',
    "installDate" DATETIME,
    "brandModel" TEXT,
    "notes" TEXT,
    "propertyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Asset_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Asset" ("createdAt", "id", "notes", "propertyId", "updatedAt") SELECT "createdAt", "id", "notes", "propertyId", "updatedAt" FROM "Asset";
DROP TABLE "Asset";
ALTER TABLE "new_Asset" RENAME TO "Asset";
CREATE INDEX "Asset_propertyId_idx" ON "Asset"("propertyId");
CREATE INDEX "Asset_propertyId_assetType_idx" ON "Asset"("propertyId", "assetType");
CREATE TABLE "new_Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentType" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileKey" TEXT NOT NULL,
    "aiSummary" TEXT,
    "notes" TEXT,
    "propertyId" TEXT NOT NULL,
    "assetId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Document_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Document_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Document" ("assetId", "createdAt", "fileKey", "id", "propertyId", "updatedAt") SELECT "assetId", "createdAt", "fileKey", "id", "propertyId", "updatedAt" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
CREATE INDEX "Document_propertyId_idx" ON "Document"("propertyId");
CREATE INDEX "Document_assetId_idx" ON "Document"("assetId");
CREATE TABLE "new_EntityNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "tags" JSONB,
    "isDecisionNote" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,
    "createdByType" TEXT NOT NULL DEFAULT 'USER',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EntityNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EntityNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_EntityNote" ("createdAt", "createdById", "createdByType", "entityId", "entityType", "id", "organizationId", "updatedAt") SELECT "createdAt", "createdById", "createdByType", "entityId", "entityType", "id", "organizationId", "updatedAt" FROM "EntityNote";
DROP TABLE "EntityNote";
ALTER TABLE "new_EntityNote" RENAME TO "EntityNote";
CREATE INDEX "EntityNote_organizationId_idx" ON "EntityNote"("organizationId");
CREATE INDEX "EntityNote_entityType_entityId_idx" ON "EntityNote"("entityType", "entityId");
CREATE INDEX "EntityNote_createdById_idx" ON "EntityNote"("createdById");
CREATE TABLE "new_FinancialEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "amount" REAL NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "maintenanceEventId" TEXT,
    "vendorId" TEXT,
    "documentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinancialEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FinancialEntry_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FinancialEntry_maintenanceEventId_fkey" FOREIGN KEY ("maintenanceEventId") REFERENCES "MaintenanceEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinancialEntry_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinancialEntry_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FinancialEntry" ("amount", "createdAt", "documentId", "id", "notes", "organizationId", "propertyId", "updatedAt", "vendorId") SELECT "amount", "createdAt", "documentId", "id", "notes", "organizationId", "propertyId", "updatedAt", "vendorId" FROM "FinancialEntry";
DROP TABLE "FinancialEntry";
ALTER TABLE "new_FinancialEntry" RENAME TO "FinancialEntry";
CREATE INDEX "FinancialEntry_organizationId_idx" ON "FinancialEntry"("organizationId");
CREATE INDEX "FinancialEntry_propertyId_idx" ON "FinancialEntry"("propertyId");
CREATE INDEX "FinancialEntry_maintenanceEventId_idx" ON "FinancialEntry"("maintenanceEventId");
CREATE INDEX "FinancialEntry_vendorId_idx" ON "FinancialEntry"("vendorId");
CREATE INDEX "FinancialEntry_documentId_idx" ON "FinancialEntry"("documentId");
CREATE INDEX "FinancialEntry_category_idx" ON "FinancialEntry"("category");
CREATE INDEX "FinancialEntry_date_idx" ON "FinancialEntry"("date");
CREATE TABLE "new_Lease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "tenantName" TEXT NOT NULL DEFAULT '',
    "leaseStartDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseEndDate" DATETIME,
    "monthlyRent" REAL NOT NULL DEFAULT 0,
    "securityDeposit" REAL NOT NULL DEFAULT 0,
    "paymentDueDay" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lease_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Lease" ("createdAt", "id", "propertyId", "updatedAt") SELECT "createdAt", "id", "propertyId", "updatedAt" FROM "Lease";
DROP TABLE "Lease";
ALTER TABLE "new_Lease" RENAME TO "Lease";
CREATE INDEX "Lease_propertyId_idx" ON "Lease"("propertyId");
CREATE INDEX "Lease_leaseStartDate_idx" ON "Lease"("leaseStartDate");
CREATE TABLE "new_Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Organization" ("createdAt", "id", "name", "updatedAt") SELECT "createdAt", "id", "name", "updatedAt" FROM "Organization";
DROP TABLE "Organization";
ALTER TABLE "new_Organization" RENAME TO "Organization";
CREATE TABLE "new_Property" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "country" TEXT,
    "purchaseDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchasePrice" REAL NOT NULL DEFAULT 0,
    "ownershipType" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    "status" TEXT NOT NULL DEFAULT 'OWNER_OCCUPIED',
    "notes" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Property_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Property" ("country", "createdAt", "id", "name", "organizationId", "updatedAt") SELECT "country", "createdAt", "id", "name", "organizationId", "updatedAt" FROM "Property";
DROP TABLE "Property";
ALTER TABLE "new_Property" RENAME TO "Property";
CREATE INDEX "Property_organizationId_idx" ON "Property"("organizationId");
CREATE INDEX "Property_organizationId_name_idx" ON "Property"("organizationId", "name");
CREATE TABLE "new_TimelineEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "propertyId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "maintenanceEventId" TEXT,
    "documentId" TEXT,
    "entityNoteId" TEXT,
    "leaseId" TEXT,
    "assetId" TEXT,
    "financialEntryId" TEXT,
    "actorId" TEXT,
    "actorType" TEXT,
    "actorLabel" TEXT,
    "actorMetadata" JSONB,
    "draftChangeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimelineEvent_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_maintenanceEventId_fkey" FOREIGN KEY ("maintenanceEventId") REFERENCES "MaintenanceEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_entityNoteId_fkey" FOREIGN KEY ("entityNoteId") REFERENCES "EntityNote" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_financialEntryId_fkey" FOREIGN KEY ("financialEntryId") REFERENCES "FinancialEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_draftChangeId_fkey" FOREIGN KEY ("draftChangeId") REFERENCES "DraftChange" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TimelineEvent" ("actorId", "actorLabel", "actorMetadata", "actorType", "assetId", "createdAt", "documentId", "draftChangeId", "entityNoteId", "financialEntryId", "id", "leaseId", "message", "metadata", "organizationId", "propertyId", "type") SELECT "actorId", "actorLabel", "actorMetadata", "actorType", "assetId", "createdAt", "documentId", "draftChangeId", "entityNoteId", "financialEntryId", "id", "leaseId", "message", "metadata", "organizationId", "propertyId", "type" FROM "TimelineEvent";
DROP TABLE "TimelineEvent";
ALTER TABLE "new_TimelineEvent" RENAME TO "TimelineEvent";
CREATE INDEX "TimelineEvent_propertyId_idx" ON "TimelineEvent"("propertyId");
CREATE INDEX "TimelineEvent_organizationId_idx" ON "TimelineEvent"("organizationId");
CREATE INDEX "TimelineEvent_maintenanceEventId_idx" ON "TimelineEvent"("maintenanceEventId");
CREATE INDEX "TimelineEvent_documentId_idx" ON "TimelineEvent"("documentId");
CREATE INDEX "TimelineEvent_entityNoteId_idx" ON "TimelineEvent"("entityNoteId");
CREATE INDEX "TimelineEvent_leaseId_idx" ON "TimelineEvent"("leaseId");
CREATE INDEX "TimelineEvent_assetId_idx" ON "TimelineEvent"("assetId");
CREATE INDEX "TimelineEvent_financialEntryId_idx" ON "TimelineEvent"("financialEntryId");
CREATE INDEX "TimelineEvent_actorId_idx" ON "TimelineEvent"("actorId");
CREATE INDEX "TimelineEvent_draftChangeId_idx" ON "TimelineEvent"("draftChangeId");
CREATE INDEX "TimelineEvent_type_idx" ON "TimelineEvent"("type");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MaintenanceEvent_propertyId_idx" ON "MaintenanceEvent"("propertyId");

-- CreateIndex
CREATE INDEX "MaintenanceEvent_assetId_idx" ON "MaintenanceEvent"("assetId");

-- CreateIndex
CREATE INDEX "MaintenanceEvent_vendorId_idx" ON "MaintenanceEvent"("vendorId");

-- CreateIndex
CREATE INDEX "MaintenanceEvent_severity_idx" ON "MaintenanceEvent"("severity");

-- CreateIndex
CREATE INDEX "MaintenanceEvent_status_idx" ON "MaintenanceEvent"("status");

