-- Add unique constraints for idempotent sync

CREATE UNIQUE INDEX IF NOT EXISTS "Requirement_projectId_externalId_key" ON "Requirement"("projectId", "externalId");
CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationConfig_projectId_type_key" ON "IntegrationConfig"("projectId", "type");
