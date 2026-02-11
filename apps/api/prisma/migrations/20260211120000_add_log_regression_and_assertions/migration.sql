-- CreateEnum
CREATE TYPE "AssertionRuleType" AS ENUM (
  'event_must_exist',
  'event_must_not_exist',
  'event_must_exist_after_anchor'
);

-- CreateEnum
CREATE TYPE "AssertionRunStatus" AS ENUM (
  'pending',
  'running',
  'completed',
  'failed'
);

-- CreateTable
CREATE TABLE "LogRegressionBaseline" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "logFileId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "snapshot" JSONB NOT NULL,
    "thresholds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,

    CONSTRAINT "LogRegressionBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAssertionRule" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ruleType" "AssertionRuleType" NOT NULL,
    "definition" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,

    CONSTRAINT "LogAssertionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAssertionRun" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "logFileId" UUID NOT NULL,
    "status" "AssertionRunStatus" NOT NULL DEFAULT 'pending',
    "triggeredBy" TEXT NOT NULL DEFAULT 'manual',
    "totalRules" INTEGER NOT NULL DEFAULT 0,
    "passedRules" INTEGER NOT NULL DEFAULT 0,
    "failedRules" INTEGER NOT NULL DEFAULT 0,
    "passRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "details" JSONB NOT NULL DEFAULT '[]',
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,

    CONSTRAINT "LogAssertionRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LogRegressionBaseline_projectId_createdAt_idx" ON "LogRegressionBaseline"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "LogRegressionBaseline_projectId_isActive_idx" ON "LogRegressionBaseline"("projectId", "isActive");

-- CreateIndex
CREATE INDEX "LogRegressionBaseline_logFileId_idx" ON "LogRegressionBaseline"("logFileId");

-- CreateIndex
CREATE INDEX "LogAssertionRule_projectId_enabled_idx" ON "LogAssertionRule"("projectId", "enabled");

-- CreateIndex
CREATE INDEX "LogAssertionRule_projectId_priority_idx" ON "LogAssertionRule"("projectId", "priority");

-- CreateIndex
CREATE INDEX "LogAssertionRule_projectId_createdAt_idx" ON "LogAssertionRule"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "LogAssertionRun_projectId_createdAt_idx" ON "LogAssertionRun"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "LogAssertionRun_projectId_status_idx" ON "LogAssertionRun"("projectId", "status");

-- CreateIndex
CREATE INDEX "LogAssertionRun_logFileId_idx" ON "LogAssertionRun"("logFileId");

-- AddForeignKey
ALTER TABLE "LogRegressionBaseline" ADD CONSTRAINT "LogRegressionBaseline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogRegressionBaseline" ADD CONSTRAINT "LogRegressionBaseline_logFileId_fkey" FOREIGN KEY ("logFileId") REFERENCES "LogFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogRegressionBaseline" ADD CONSTRAINT "LogRegressionBaseline_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAssertionRule" ADD CONSTRAINT "LogAssertionRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAssertionRule" ADD CONSTRAINT "LogAssertionRule_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAssertionRun" ADD CONSTRAINT "LogAssertionRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAssertionRun" ADD CONSTRAINT "LogAssertionRun_logFileId_fkey" FOREIGN KEY ("logFileId") REFERENCES "LogFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAssertionRun" ADD CONSTRAINT "LogAssertionRun_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
