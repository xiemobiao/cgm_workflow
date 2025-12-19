# UI Pages and Information Architecture (MVP)

## Top Navigation
- Dashboard
- Requirements
- Workflows
- Logs
- Incidents
- Integrations
- Settings

## Page List

### 1) Dashboard
- KPIs: active workflows, gate blockers, open incidents
- Recent activity feed
- Quick links to create workflow and upload logs

### 2) Requirements
- Requirement list (sync status, source, owner)
- Filters: project, status, tag, owner
- Action: create workflow instance

### 3) Workflows
- Workflow list (stage, status, owner, last update)
- Workflow detail:
  - Stage timeline
  - Gate status and approval actions
  - Artifacts list
  - Linked requirement and release artifacts

### 4) Logs
- Upload decoded JSONL
- Search view: event name, time range, appId, sdkVersion, level
- Log detail: raw JSON line and parsed fields

### 5) Incidents
- Incident list (status, severity, time)
- Incident detail:
  - Linked logs
  - Related workflow and release artifacts
  - Runbook steps

### 6) Integrations
- Integration list (PingCode/Feishu/GitLab)
- Integration detail:
  - Config summary
  - Field mapping editor
  - Sync status

### 7) Settings
- Roles and permissions
- Template management
- Audit log

## Main User Flows

### Flow A: Requirement to Release
1. Requirement sync -> Requirements list
2. Create workflow -> Workflows detail
3. Attach artifacts -> Gate approvals
4. Trigger CI -> Test gate
5. Release gate approved

### Flow B: Incident Diagnosis
1. Upload decoded JSONL -> Logs search
2. Identify events -> Link to incident
3. Runbook steps -> Resolution

## Key Navigation Links
- Requirement -> Workflow detail
- Workflow -> Logs search (filtered by project/version)
- Incident -> Linked log events
- Integration -> Mapping editor
