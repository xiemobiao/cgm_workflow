/*
  Warnings:

  - You are about to drop the `Artifact` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Gate` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `IntegrationConfig` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PipelineRun` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Requirement` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StageInstance` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WorkflowInstance` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WorkflowTemplate` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Artifact" DROP CONSTRAINT "Artifact_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "Artifact" DROP CONSTRAINT "Artifact_workflowId_fkey";

-- DropForeignKey
ALTER TABLE "Gate" DROP CONSTRAINT "Gate_approverId_fkey";

-- DropForeignKey
ALTER TABLE "Gate" DROP CONSTRAINT "Gate_stageInstanceId_fkey";

-- DropForeignKey
ALTER TABLE "IntegrationConfig" DROP CONSTRAINT "IntegrationConfig_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "IntegrationConfig" DROP CONSTRAINT "IntegrationConfig_projectId_fkey";

-- DropForeignKey
ALTER TABLE "PipelineRun" DROP CONSTRAINT "PipelineRun_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Requirement" DROP CONSTRAINT "Requirement_projectId_fkey";

-- DropForeignKey
ALTER TABLE "StageInstance" DROP CONSTRAINT "StageInstance_workflowId_fkey";

-- DropForeignKey
ALTER TABLE "WorkflowInstance" DROP CONSTRAINT "WorkflowInstance_projectId_fkey";

-- DropForeignKey
ALTER TABLE "WorkflowInstance" DROP CONSTRAINT "WorkflowInstance_requirementId_fkey";

-- DropForeignKey
ALTER TABLE "WorkflowTemplate" DROP CONSTRAINT "WorkflowTemplate_projectId_fkey";

-- DropTable
DROP TABLE "Artifact";

-- DropTable
DROP TABLE "Gate";

-- DropTable
DROP TABLE "IntegrationConfig";

-- DropTable
DROP TABLE "PipelineRun";

-- DropTable
DROP TABLE "Requirement";

-- DropTable
DROP TABLE "StageInstance";

-- DropTable
DROP TABLE "WorkflowInstance";

-- DropTable
DROP TABLE "WorkflowTemplate";

-- DropEnum
DROP TYPE "ArtifactType";

-- DropEnum
DROP TYPE "GateStatus";

-- DropEnum
DROP TYPE "IntegrationStatus";

-- DropEnum
DROP TYPE "IntegrationType";

-- DropEnum
DROP TYPE "RequirementStatus";

-- DropEnum
DROP TYPE "StageName";

-- DropEnum
DROP TYPE "StageStatus";

-- DropEnum
DROP TYPE "WorkflowStatus";
