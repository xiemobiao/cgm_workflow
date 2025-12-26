-- AlterTable
ALTER TABLE "LogEvent" ADD COLUMN     "deviceSn" TEXT;

-- CreateIndex
CREATE INDEX "LogEvent_deviceSn_timestampMs_idx" ON "LogEvent"("deviceSn", "timestampMs");
