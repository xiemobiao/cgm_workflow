-- AlterTable
ALTER TABLE "LogFileAnalysis" ADD COLUMN     "eventCoverageAnalysis" JSONB,
ADD COLUMN     "mainFlowAnalysis" JSONB;
