# Integrations (MVP)

## PingCode (Requirements)
- Sync fields: id, title, type, status, priority, owner, tags
- Mapping rule: type=Requirement and tag contains CGM => create workflow
- Status mapping: In Progress => Development, Testing => Test, Done => Release
- Fallback: manual import via CSV

### Field Mapping (no sample fields)
- Internal required fields: external_id, title, status
- Optional fields: type, priority, owner, tags
- Mapping is configured per project by Admin
- If required fields are not mapped, auto sync is disabled
- Store mapping as JSON in IntegrationConfig
- Store raw external status in requirements.source_status for debugging
- Normalize status per `21_requirement_status_mapping.md`

## Feishu (Notifications)
- Post stage changes to a project channel
- Use Feishu link fields for design and PRD references
- Approval workflow can be manual in MVP

## GitLab (CI)
- Store base URL, project id, and token
- Trigger pipeline when stage enters Test
- Poll pipeline status and attach report URLs
- Fallback: manual status update if not configured

## Log Ingestion
- Accept decoded JSONL files (one JSON object per line)
- Required outer fields: c, f, l, n, i, m
- Inner field c must include event and msg
- Reference spec: `../logging/cgm_log_format_spec.md`

## Security
- Store tokens encrypted
- Limit integration access by project role
