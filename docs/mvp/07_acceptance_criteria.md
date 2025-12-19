# Acceptance Criteria (MVP)

## Functional
- Requirements can be synced and create workflow instances
- Workflow stages and gates are visible and editable
- Gate approvals and overrides are audit logged
- Decoded JSONL logs can be uploaded and searched
- Incidents can link to logs and workflows
- Admin can configure field mappings for requirement sync

## Access Control
- Role based permissions enforced per project
- Unauthorized users cannot approve gates

## Observability
- All critical actions are auditable
- Failed log parses are visible in the UI

## Usability
- Users can find logs by event name and time range
- Workflow status is visible at a glance
