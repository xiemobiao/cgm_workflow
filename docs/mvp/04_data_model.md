# Data Model (MVP)

## Core Entities
- User: id, name, email, status
- Role: id, name
- Project: id, name, type (SDK or App)
- ProjectMember: user_id, project_id, role_id
- Requirement: id, external_id, title, status, source, source_status, owner, priority, tags
- WorkflowTemplate: id, name, project_type
- WorkflowInstance: id, project_id, requirement_id, status
- StageInstance: id, workflow_id, stage_name, status
- Gate: id, stage_instance_id, status, approver_id
- Artifact: id, workflow_id, type, url, owner_id

## Integrations
- IntegrationConfig: id, project_id, type, status, secrets_ref, mapping, last_sync_at, last_error, created_by
- PipelineRun: id, project_id, external_id, status, url

## Logs and Incidents
- LogFile: id, project_id, file_name, file_size, status, uploaded_at, source_device, parser_version
- LogEvent: id, log_file_id, event_name, level, timestamp_ms, msg_json, sdk_version, app_id, terminal_info, thread_name, thread_id, is_main_thread, raw_line
- Incident: id, project_id, title, status, severity
- IncidentLogLink: incident_id, log_event_id

## Notes
- Store log payloads in JSON columns
- Use soft delete for requirements and incidents
- requirement.status is normalized; store raw external status in source_status when available
