# API Test Checklist (MVP)

## Auth
- [ ] POST /api/auth/login
  - Expect 200 with token and user info
- [ ] GET /api/auth/me
  - Expect 200 with current user

## Projects
- [ ] POST /api/projects
  - Create project, expect 200 and project id
- [ ] GET /api/projects
  - List projects, expect created project

## Integrations
- [ ] POST /api/integrations
  - Create integration, expect enabled status
- [ ] PUT /api/integrations/{id}/mapping
  - Save mapping, expect updatedAt
- [ ] POST /api/requirements/sync
  - Sync requirements, expect synced count

## Workflows
- [ ] POST /api/workflows
  - Create workflow for requirement
- [ ] PATCH /api/workflows/{id}/status
  - Update status to blocked

## Gates
- [ ] POST /api/workflows/{id}/gates/{gate_id}/approve
  - Approve gate, expect status approved
- [ ] POST /api/workflows/{id}/gates/{gate_id}/override
  - Override gate, expect status overridden

## Artifacts
- [ ] POST /api/artifacts
  - Attach artifact to workflow

## Logs
- [ ] POST /api/logs/upload
  - Upload decoded JSONL, expect logFileId
- [ ] GET /api/logs/events/search
  - Search by eventName and time range

## Incidents
- [ ] POST /api/incidents
  - Create incident, expect status open
- [ ] PATCH /api/incidents/{id}
  - Update status resolved

## Permissions
- [ ] Attempt gate approval with non-approver role
  - Expect 403
- [ ] Attempt integration update with Viewer role
  - Expect 403
