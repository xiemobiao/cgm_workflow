-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('pending', 'analyzing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "LogFileAnalysis" (
    "id" UUID NOT NULL,
    "logFileId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "qualityScore" INTEGER NOT NULL,
    "bleQuality" JSONB,
    "backendQuality" JSONB,
    "anomalies" JSONB NOT NULL DEFAULT '[]',
    "knownIssueMatches" JSONB NOT NULL DEFAULT '[]',
    "totalEvents" INTEGER NOT NULL DEFAULT 0,
    "errorEvents" INTEGER NOT NULL DEFAULT 0,
    "warningEvents" INTEGER NOT NULL DEFAULT 0,
    "sessionCount" INTEGER NOT NULL DEFAULT 0,
    "deviceCount" INTEGER NOT NULL DEFAULT 0,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "analyzedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogFileAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LogFileAnalysis_logFileId_key" ON "LogFileAnalysis"("logFileId");

-- CreateIndex
CREATE INDEX "LogFileAnalysis_projectId_createdAt_idx" ON "LogFileAnalysis"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "LogFileAnalysis_status_idx" ON "LogFileAnalysis"("status");

-- CreateIndex
CREATE INDEX "LogFileAnalysis_qualityScore_idx" ON "LogFileAnalysis"("qualityScore");

-- AddForeignKey
ALTER TABLE "LogFileAnalysis" ADD CONSTRAINT "LogFileAnalysis_logFileId_fkey" FOREIGN KEY ("logFileId") REFERENCES "LogFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogFileAnalysis" ADD CONSTRAINT "LogFileAnalysis_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
