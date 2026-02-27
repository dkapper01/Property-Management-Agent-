-- CreateTable
CREATE TABLE "FinancialEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "maintenanceRequestId" TEXT,
    "vendorId" TEXT,
    "documentId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinancialEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FinancialEntry_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FinancialEntry_maintenanceRequestId_fkey" FOREIGN KEY ("maintenanceRequestId") REFERENCES "MaintenanceRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinancialEntry_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinancialEntry_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinancialEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MaintenanceRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "category" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "riskScore" INTEGER,
    "lifespanImpactMonths" INTEGER,
    "capexOpex" TEXT DEFAULT 'UNKNOWN',
    "classificationSource" TEXT,
    "classificationConfidence" REAL,
    "expectedFailureDate" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'WEB',
    "sourceThreadId" TEXT,
    "accessNotes" TEXT,
    "imageKeys" JSONB,
    "vendorStatus" TEXT NOT NULL DEFAULT 'NOT_ASSIGNED',
    "vendorCostEstimate" REAL,
    "vendorActualCost" REAL,
    "scheduledAt" DATETIME,
    "completedAt" DATETIME,
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
INSERT INTO "new_MaintenanceRequest" ("accessNotes", "assetId", "assignedVendorId", "capexOpex", "category", "classificationConfidence", "classificationSource", "createdAt", "description", "expectedFailureDate", "id", "imageKeys", "lifespanImpactMonths", "propertyId", "requestedByUserId", "riskScore", "severity", "source", "sourceThreadId", "status", "title", "unitId", "updatedAt") SELECT "accessNotes", "assetId", "assignedVendorId", "capexOpex", "category", "classificationConfidence", "classificationSource", "createdAt", "description", "expectedFailureDate", "id", "imageKeys", "lifespanImpactMonths", "propertyId", "requestedByUserId", "riskScore", "severity", "source", "sourceThreadId", "status", "title", "unitId", "updatedAt" FROM "MaintenanceRequest";
DROP TABLE "MaintenanceRequest";
ALTER TABLE "new_MaintenanceRequest" RENAME TO "MaintenanceRequest";
CREATE INDEX "MaintenanceRequest_propertyId_idx" ON "MaintenanceRequest"("propertyId");
CREATE INDEX "MaintenanceRequest_unitId_idx" ON "MaintenanceRequest"("unitId");
CREATE INDEX "MaintenanceRequest_assetId_idx" ON "MaintenanceRequest"("assetId");
CREATE INDEX "MaintenanceRequest_assignedVendorId_idx" ON "MaintenanceRequest"("assignedVendorId");
CREATE INDEX "MaintenanceRequest_requestedByUserId_idx" ON "MaintenanceRequest"("requestedByUserId");
CREATE INDEX "MaintenanceRequest_category_idx" ON "MaintenanceRequest"("category");
CREATE INDEX "MaintenanceRequest_severity_idx" ON "MaintenanceRequest"("severity");
CREATE INDEX "MaintenanceRequest_capexOpex_idx" ON "MaintenanceRequest"("capexOpex");
CREATE INDEX "MaintenanceRequest_source_idx" ON "MaintenanceRequest"("source");
CREATE INDEX "MaintenanceRequest_sourceThreadId_idx" ON "MaintenanceRequest"("sourceThreadId");
CREATE INDEX "MaintenanceRequest_vendorStatus_idx" ON "MaintenanceRequest"("vendorStatus");
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
    "financialEntryId" TEXT,
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
    CONSTRAINT "TimelineEvent_financialEntryId_fkey" FOREIGN KEY ("financialEntryId") REFERENCES "FinancialEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_draftChangeId_fkey" FOREIGN KEY ("draftChangeId") REFERENCES "DraftChange" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TimelineEvent" ("actorId", "actorLabel", "actorMetadata", "actorType", "assetId", "createdAt", "documentId", "draftChangeId", "entityNoteId", "id", "leaseId", "maintenanceRequestId", "message", "metadata", "organizationId", "propertyId", "type") SELECT "actorId", "actorLabel", "actorMetadata", "actorType", "assetId", "createdAt", "documentId", "draftChangeId", "entityNoteId", "id", "leaseId", "maintenanceRequestId", "message", "metadata", "organizationId", "propertyId", "type" FROM "TimelineEvent";
DROP TABLE "TimelineEvent";
ALTER TABLE "new_TimelineEvent" RENAME TO "TimelineEvent";
CREATE INDEX "TimelineEvent_propertyId_idx" ON "TimelineEvent"("propertyId");
CREATE INDEX "TimelineEvent_organizationId_idx" ON "TimelineEvent"("organizationId");
CREATE INDEX "TimelineEvent_maintenanceRequestId_idx" ON "TimelineEvent"("maintenanceRequestId");
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
CREATE UNIQUE INDEX "FinancialEntry_maintenanceRequestId_key" ON "FinancialEntry"("maintenanceRequestId");

-- CreateIndex
CREATE INDEX "FinancialEntry_organizationId_idx" ON "FinancialEntry"("organizationId");

-- CreateIndex
CREATE INDEX "FinancialEntry_propertyId_idx" ON "FinancialEntry"("propertyId");

-- CreateIndex
CREATE INDEX "FinancialEntry_maintenanceRequestId_idx" ON "FinancialEntry"("maintenanceRequestId");

-- CreateIndex
CREATE INDEX "FinancialEntry_vendorId_idx" ON "FinancialEntry"("vendorId");

-- CreateIndex
CREATE INDEX "FinancialEntry_documentId_idx" ON "FinancialEntry"("documentId");

-- CreateIndex
CREATE INDEX "FinancialEntry_createdByUserId_idx" ON "FinancialEntry"("createdByUserId");

-- CreateIndex
CREATE INDEX "FinancialEntry_type_idx" ON "FinancialEntry"("type");

-- CreateIndex
CREATE INDEX "FinancialEntry_source_idx" ON "FinancialEntry"("source");

-- CreateIndex
CREATE INDEX "FinancialEntry_occurredAt_idx" ON "FinancialEntry"("occurredAt");
