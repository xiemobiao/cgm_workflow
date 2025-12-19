# NestJS Module Map (MVP)

## Module List
- AuthModule
- UsersModule
- ProjectsModule
- RolesModule
- RequirementsModule
- WorkflowsModule
- GatesModule
- ArtifactsModule
- IntegrationsModule
- PipelinesModule
- LogsModule
- IncidentsModule
- AuditModule
- StorageModule

## Module Responsibilities

### AuthModule
- Login/logout
- Token validation

### UsersModule
- User CRUD

### RolesModule
- Role definitions
- Permission checks

### ProjectsModule
- Project CRUD
- Membership management

### RequirementsModule
- Requirement sync
- Mapping validation

### WorkflowsModule
- Workflow instance creation
- Stage transitions

### GatesModule
- Gate approval/override
- Gate audit records

### ArtifactsModule
- Artifact upload metadata
- Linking artifacts to workflows

### IntegrationsModule
- Integration config CRUD
- Field mapping storage

### PipelinesModule
- CI trigger and status polling

### LogsModule
- Log upload
- Parse decoded JSONL
- Search and filters

### IncidentsModule
- Incident CRUD
- Link to logs and workflows

### AuditModule
- Store audit records
- Expose audit search

### StorageModule
- Abstract file storage (MinIO/local)

## Dependencies (High-Level)
- AuthModule -> UsersModule, RolesModule
- ProjectsModule -> UsersModule, RolesModule
- RequirementsModule -> IntegrationsModule, ProjectsModule
- WorkflowsModule -> RequirementsModule, ProjectsModule
- GatesModule -> WorkflowsModule, AuditModule
- ArtifactsModule -> WorkflowsModule, StorageModule
- PipelinesModule -> IntegrationsModule, ProjectsModule
- LogsModule -> StorageModule, ProjectsModule
- IncidentsModule -> LogsModule, ProjectsModule, AuditModule
- AuditModule -> UsersModule
