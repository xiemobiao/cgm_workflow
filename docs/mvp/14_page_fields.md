# Page Fields and Components (MVP)

## Dashboard
**Key Fields**
- activeWorkflows
- gateBlockers
- openIncidents
- lastUpdatedAt

**Components**
- KPI cards (active workflows, blockers, incidents)
- Activity feed (recent approvals, incidents, uploads)
- Quick actions (create workflow, upload logs)

## Requirements
**Table Columns**
- externalId
- title
- status
- priority
- source
- owner
- tags
- createdAt
- workflowId (nullable)

**Filters**
- project
- status
- owner
- tag
- source

**Actions**
- create workflow
- view workflow

## Workflows
**Table Columns**
- workflowId
- requirementTitle
- currentStage
- status
- owner (from requirement)
- updatedAt

**Filters**
- project
- stage
- status
- owner

**Workflow Detail**
- Stage timeline (stage, status, updatedAt)
- Gates list (status, approver, decidedAt, reason)
- Artifacts list (type, url, owner, createdAt)
- Linked requirement (externalId, status, source)

## Logs
**Upload Fields**
- projectId
- file (decoded JSONL)
- fileName (optional)

**Search Filters**
- eventName
- timeRange (startTime, endTime)
- appId
- sdkVersion
- level

**Results Columns**
- eventName
- level
- timestampMs
- sdkVersion
- appId
- terminalInfo

**Log Detail**
- rawLine
- parsedFields (event, msg, sdkInfo, terminalInfo, appInfo)
- threadInfo (n, i, m)

## Incidents
**Table Columns**
- title
- status
- severity
- startTime
- endTime

**Filters**
- status
- severity
- timeRange

**Incident Detail**
- Linked log events (eventName, timestampMs, level)
- Related workflow (workflowId, stage, status)
- Runbook steps

## Integrations
**Table Columns**
- type
- status
- lastSyncAt
- owner

**Integration Detail**
- Config summary (baseUrl, projectId, status)
- Mapping editor (fieldMap, statusMap, filters)
- Sync status and last error

## Settings
**Roles and Permissions**
- role
- permission

**Templates**
- templateName
- projectType
- updatedAt

**Audit Log**
- actor
- action
- target
- timestamp
