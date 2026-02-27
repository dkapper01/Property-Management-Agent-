-- AlterTable
ALTER TABLE "MaintenanceRequest" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "MaintenanceRequest" ADD COLUMN "category" TEXT;
ALTER TABLE "MaintenanceRequest" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'WEB';
ALTER TABLE "MaintenanceRequest" ADD COLUMN "sourceThreadId" TEXT;
ALTER TABLE "MaintenanceRequest" ADD COLUMN "preferredContactMethod" TEXT;
ALTER TABLE "MaintenanceRequest" ADD COLUMN "accessNotes" TEXT;

-- CreateTable
CREATE TABLE "MaintenanceRequestAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "maintenanceRequestId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "altText" TEXT,
    "source" TEXT NOT NULL DEFAULT 'WEB',
    "uploadedByType" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaintenanceRequestAttachment_maintenanceRequestId_fkey" FOREIGN KEY ("maintenanceRequestId") REFERENCES "MaintenanceRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceRequestAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MaintenanceRequest_priority_idx" ON "MaintenanceRequest"("priority");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_category_idx" ON "MaintenanceRequest"("category");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_source_idx" ON "MaintenanceRequest"("source");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_sourceThreadId_idx" ON "MaintenanceRequest"("sourceThreadId");

-- CreateIndex
CREATE INDEX "MaintenanceRequestAttachment_maintenanceRequestId_idx" ON "MaintenanceRequestAttachment"("maintenanceRequestId");

-- CreateIndex
CREATE INDEX "MaintenanceRequestAttachment_uploadedById_idx" ON "MaintenanceRequestAttachment"("uploadedById");
