-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('scanning', 'pairing', 'connecting', 'connected', 'communicating', 'disconnected', 'timeout', 'error');

-- CreateEnum
CREATE TYPE "AnomalyType" AS ENUM ('frequent_disconnect', 'timeout_retry', 'error_burst', 'slow_connection', 'command_failure');

-- CreateEnum
CREATE TYPE "IssueCategory" AS ENUM ('connection', 'data', 'device', 'app', 'permission', 'protocol', 'other');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('session_analysis', 'device_comparison', 'incident_summary', 'error_distribution', 'performance_analysis');

-- AlterTable
ALTER TABLE "LogEvent" ADD COLUMN     "deviceMac" TEXT,
ADD COLUMN     "errorCode" TEXT,
ADD COLUMN     "linkCode" TEXT,
ADD COLUMN     "requestId" TEXT;

-- CreateTable
CREATE TABLE "LogEventStats" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "logFileId" UUID NOT NULL,
    "eventName" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "LogEventStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceSession" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "linkCode" TEXT NOT NULL,
    "deviceMac" TEXT,
    "startTimeMs" BIGINT NOT NULL,
    "endTimeMs" BIGINT,
    "durationMs" INTEGER,
    "status" "SessionStatus" NOT NULL,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "commandCount" INTEGER NOT NULL DEFAULT 0,
    "scanStartMs" BIGINT,
    "pairStartMs" BIGINT,
    "connectStartMs" BIGINT,
    "connectedMs" BIGINT,
    "disconnectMs" BIGINT,
    "sdkVersion" TEXT,
    "appId" TEXT,
    "terminalInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnomalyPattern" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "patternType" "AnomalyType" NOT NULL,
    "deviceMac" TEXT,
    "sdkVersion" TEXT,
    "startTimeMs" BIGINT NOT NULL,
    "endTimeMs" BIGINT NOT NULL,
    "occurrenceCount" INTEGER NOT NULL,
    "avgIntervalMs" INTEGER,
    "affectedSessions" INTEGER NOT NULL,
    "sampleEventIds" JSONB NOT NULL,
    "severity" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnomalyPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnownIssue" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "errorCode" TEXT,
    "eventPattern" TEXT,
    "msgPattern" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "solution" TEXT NOT NULL,
    "category" "IssueCategory" NOT NULL DEFAULT 'other',
    "severity" INTEGER NOT NULL DEFAULT 2,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,

    CONSTRAINT "KnownIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisReport" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "reportType" "ReportType" NOT NULL,
    "content" JSONB NOT NULL,
    "sourceData" JSONB NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,

    CONSTRAINT "AnalysisReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LogEventStats_projectId_eventName_idx" ON "LogEventStats"("projectId", "eventName");

-- CreateIndex
CREATE UNIQUE INDEX "LogEventStats_logFileId_eventName_level_key" ON "LogEventStats"("logFileId", "eventName", "level");

-- CreateIndex
CREATE INDEX "DeviceSession_projectId_startTimeMs_idx" ON "DeviceSession"("projectId", "startTimeMs");

-- CreateIndex
CREATE INDEX "DeviceSession_deviceMac_startTimeMs_idx" ON "DeviceSession"("deviceMac", "startTimeMs");

-- CreateIndex
CREATE INDEX "DeviceSession_status_idx" ON "DeviceSession"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceSession_projectId_linkCode_key" ON "DeviceSession"("projectId", "linkCode");

-- CreateIndex
CREATE INDEX "AnomalyPattern_projectId_patternType_createdAt_idx" ON "AnomalyPattern"("projectId", "patternType", "createdAt");

-- CreateIndex
CREATE INDEX "AnomalyPattern_deviceMac_idx" ON "AnomalyPattern"("deviceMac");

-- CreateIndex
CREATE INDEX "AnomalyPattern_severity_idx" ON "AnomalyPattern"("severity");

-- CreateIndex
CREATE INDEX "KnownIssue_projectId_errorCode_idx" ON "KnownIssue"("projectId", "errorCode");

-- CreateIndex
CREATE INDEX "KnownIssue_projectId_category_idx" ON "KnownIssue"("projectId", "category");

-- CreateIndex
CREATE INDEX "KnownIssue_isActive_idx" ON "KnownIssue"("isActive");

-- CreateIndex
CREATE INDEX "AnalysisReport_projectId_createdAt_idx" ON "AnalysisReport"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalysisReport_reportType_idx" ON "AnalysisReport"("reportType");

-- CreateIndex
CREATE INDEX "LogEvent_linkCode_timestampMs_idx" ON "LogEvent"("linkCode", "timestampMs");

-- CreateIndex
CREATE INDEX "LogEvent_requestId_timestampMs_idx" ON "LogEvent"("requestId", "timestampMs");

-- CreateIndex
CREATE INDEX "LogEvent_deviceMac_timestampMs_idx" ON "LogEvent"("deviceMac", "timestampMs");

-- CreateIndex
CREATE INDEX "LogEvent_errorCode_idx" ON "LogEvent"("errorCode");

-- AddForeignKey
ALTER TABLE "LogEventStats" ADD CONSTRAINT "LogEventStats_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogEventStats" ADD CONSTRAINT "LogEventStats_logFileId_fkey" FOREIGN KEY ("logFileId") REFERENCES "LogFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceSession" ADD CONSTRAINT "DeviceSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnomalyPattern" ADD CONSTRAINT "AnomalyPattern_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnownIssue" ADD CONSTRAINT "KnownIssue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnownIssue" ADD CONSTRAINT "KnownIssue_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisReport" ADD CONSTRAINT "AnalysisReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisReport" ADD CONSTRAINT "AnalysisReport_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
