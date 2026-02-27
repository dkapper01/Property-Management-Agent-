PRAGMA foreign_keys=OFF;

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "manufacturer" TEXT,
    "modelNumber" TEXT,
    "serialNumber" TEXT,
    "installedAt" DATETIME,
    "expectedLifespanMonths" INTEGER,
    "notes" TEXT,
    "propertyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Asset_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Vendor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "fileKey" TEXT,
    "fileName" TEXT,
    "fileType" TEXT,
    "propertyId" TEXT NOT NULL,
    "maintenanceRequestId" TEXT,
    "assetId" TEXT,
    "uploadedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Document_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Document_maintenanceRequestId_fkey" FOREIGN KEY ("maintenanceRequestId") REFERENCES "MaintenanceRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NoteTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "description" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NoteTag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EntityNoteTag" (
    "noteId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    PRIMARY KEY ("noteId", "tagId"),
    CONSTRAINT "EntityNoteTag_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "EntityNote" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EntityNoteTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "NoteTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EntityNoteLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT,
    "noteId" TEXT NOT NULL,
    "targetEntityType" TEXT NOT NULL,
    "targetEntityId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EntityNoteLink_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "EntityNote" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimelineEvent_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_maintenanceRequestId_fkey" FOREIGN KEY ("maintenanceRequestId") REFERENCES "MaintenanceRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_entityNoteId_fkey" FOREIGN KEY ("entityNoteId") REFERENCES "EntityNote" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTable
CREATE TABLE "new_MaintenanceRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "category" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "riskScore" INTEGER,
    "lifespanImpactMonths" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'WEB',
    "sourceThreadId" TEXT,
    "accessNotes" TEXT,
    "imageKeys" JSONB,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "assetId" TEXT,
    "assignedVendorId" TEXT,
    "requestedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MaintenanceRequest_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceRequest_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceRequest_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceRequest_assignedVendorId_fkey" FOREIGN KEY ("assignedVendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_MaintenanceRequest" (
    "id",
    "title",
    "description",
    "status",
    "category",
    "severity",
    "riskScore",
    "lifespanImpactMonths",
    "source",
    "sourceThreadId",
    "accessNotes",
    "imageKeys",
    "propertyId",
    "unitId",
    "assetId",
    "assignedVendorId",
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
    'MEDIUM' as "severity",
    NULL as "riskScore",
    NULL as "lifespanImpactMonths",
    "source",
    "sourceThreadId",
    "accessNotes",
    "imageKeys",
    "propertyId",
    "unitId",
    NULL as "assetId",
    NULL as "assignedVendorId",
    "requestedByUserId",
    "createdAt",
    "updatedAt"
FROM "MaintenanceRequest";

DROP TABLE "MaintenanceRequest";
ALTER TABLE "new_MaintenanceRequest" RENAME TO "MaintenanceRequest";

-- AlterTable
ALTER TABLE "EntityNote" ADD COLUMN "title" TEXT;
ALTER TABLE "EntityNote" ADD COLUMN "aiSummary" TEXT;
ALTER TABLE "EntityNote" ADD COLUMN "aiSummaryUpdatedAt" DATETIME;
ALTER TABLE "EntityNote" ADD COLUMN "aiMetadata" JSONB;

-- Indexes
CREATE INDEX "Asset_propertyId_idx" ON "Asset"("propertyId");
CREATE INDEX "Asset_propertyId_name_idx" ON "Asset"("propertyId", "name");

CREATE INDEX "Vendor_organizationId_idx" ON "Vendor"("organizationId");
CREATE INDEX "Vendor_organizationId_name_idx" ON "Vendor"("organizationId", "name");

CREATE INDEX "Document_propertyId_idx" ON "Document"("propertyId");
CREATE INDEX "Document_maintenanceRequestId_idx" ON "Document"("maintenanceRequestId");
CREATE INDEX "Document_assetId_idx" ON "Document"("assetId");
CREATE INDEX "Document_uploadedByUserId_idx" ON "Document"("uploadedByUserId");

CREATE UNIQUE INDEX "NoteTag_organizationId_name_key" ON "NoteTag"("organizationId", "name");
CREATE INDEX "NoteTag_organizationId_idx" ON "NoteTag"("organizationId");

CREATE INDEX "EntityNoteTag_tagId_idx" ON "EntityNoteTag"("tagId");

CREATE INDEX "EntityNoteLink_noteId_idx" ON "EntityNoteLink"("noteId");
CREATE INDEX "EntityNoteLink_targetEntityType_targetEntityId_idx" ON "EntityNoteLink"("targetEntityType", "targetEntityId");

CREATE INDEX "TimelineEvent_propertyId_idx" ON "TimelineEvent"("propertyId");
CREATE INDEX "TimelineEvent_organizationId_idx" ON "TimelineEvent"("organizationId");
CREATE INDEX "TimelineEvent_maintenanceRequestId_idx" ON "TimelineEvent"("maintenanceRequestId");
CREATE INDEX "TimelineEvent_documentId_idx" ON "TimelineEvent"("documentId");
CREATE INDEX "TimelineEvent_entityNoteId_idx" ON "TimelineEvent"("entityNoteId");
CREATE INDEX "TimelineEvent_leaseId_idx" ON "TimelineEvent"("leaseId");
CREATE INDEX "TimelineEvent_assetId_idx" ON "TimelineEvent"("assetId");
CREATE INDEX "TimelineEvent_actorId_idx" ON "TimelineEvent"("actorId");
CREATE INDEX "TimelineEvent_type_idx" ON "TimelineEvent"("type");

CREATE INDEX "MaintenanceRequest_propertyId_idx" ON "MaintenanceRequest"("propertyId");
CREATE INDEX "MaintenanceRequest_unitId_idx" ON "MaintenanceRequest"("unitId");
CREATE INDEX "MaintenanceRequest_assetId_idx" ON "MaintenanceRequest"("assetId");
CREATE INDEX "MaintenanceRequest_assignedVendorId_idx" ON "MaintenanceRequest"("assignedVendorId");
CREATE INDEX "MaintenanceRequest_requestedByUserId_idx" ON "MaintenanceRequest"("requestedByUserId");
CREATE INDEX "MaintenanceRequest_category_idx" ON "MaintenanceRequest"("category");
CREATE INDEX "MaintenanceRequest_severity_idx" ON "MaintenanceRequest"("severity");
CREATE INDEX "MaintenanceRequest_source_idx" ON "MaintenanceRequest"("source");
CREATE INDEX "MaintenanceRequest_sourceThreadId_idx" ON "MaintenanceRequest"("sourceThreadId");

PRAGMA foreign_keys=ON;
