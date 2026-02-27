-- AlterTable
ALTER TABLE "TimelineEvent" ADD COLUMN "leaseId" TEXT REFERENCES "Lease" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "TimelineEvent_leaseId_idx" ON "TimelineEvent"("leaseId");
