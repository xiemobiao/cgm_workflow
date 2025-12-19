# Backend Task Breakdown (MVP)

## Task Group A: Foundation

### A1. Project Bootstrap
- Scope: NestJS project init, env loading, config module
- Deliverables: app skeleton, config validation
- Dependencies: none
- Verify: server boots with /health

### A2. Database Layer
- Scope: ORM setup, migrations, base repositories
- Deliverables: migrations for core tables
- Dependencies: A1
- Verify: migrations run successfully

### A3. Auth and RBAC
- Scope: JWT auth, role guard, project-level access control
- Deliverables: auth endpoints, guard middleware
- Dependencies: A1, A2
- Verify: protected route returns 401/403 as expected

## Task Group B: Core Workflow

### B1. Projects and Members
- Scope: project CRUD, member assignment
- Deliverables: project APIs
- Dependencies: A3
- Verify: create/list project with members

### B2. Requirements Sync
- Scope: requirement model + sync pipeline stub
- Deliverables: sync endpoint, mapping validation
- Dependencies: A3, B1, C1
- Verify: sync endpoint accepts mapping and returns counts

### B3. Workflow Instances
- Scope: workflow create, stage transitions
- Deliverables: workflow endpoints, status changes
- Dependencies: A3, B1, B2
- Verify: create workflow from requirement

### B4. Gates and Approvals
- Scope: gate status, approve/override
- Deliverables: gate endpoints + audit entry
- Dependencies: A3, B3, E1
- Verify: approval recorded, override blocked by role

### B5. Artifacts
- Scope: artifact metadata and linking to workflow
- Deliverables: artifact create/list endpoints
- Dependencies: A3, B3
- Verify: attach artifact to workflow

## Task Group C: Integrations

### C1. Integration Config
- Scope: integration CRUD, mapping storage
- Deliverables: integration endpoints, mapping update
- Dependencies: A3, A2
- Verify: mapping saved and retrieved

### C2. CI Trigger (GitLab)
- Scope: pipeline trigger + status polling stub
- Deliverables: trigger endpoint, status record
- Dependencies: C1
- Verify: pipeline run stored with external id

## Task Group D: Logs and Incidents

### D1. Log Upload
- Scope: decoded JSONL upload, store metadata
- Deliverables: upload endpoint, storage adapter
- Dependencies: A3, F1
- Verify: upload returns logFileId

### D2. Log Parse and Search
- Scope: parse JSONL lines, persist events, search API
- Deliverables: search endpoint, pagination
- Dependencies: D1, A2
- Verify: search by eventName returns results

### D3. Incident Management
- Scope: incident CRUD, link logs
- Deliverables: incident endpoints
- Dependencies: A3, D2
- Verify: incident links to log events

## Task Group E: Audit

### E1. Audit Log
- Scope: audit record model + write helpers
- Deliverables: audit table and query API
- Dependencies: A2
- Verify: gate approval writes audit entry

## Task Group F: Storage

### F1. Storage Adapter
- Scope: MinIO/local storage abstraction
- Deliverables: storage service used by logs/artifacts
- Dependencies: A1
- Verify: file saved and retrieved by id

## Task Group G: Quality

### G1. API Contract Tests
- Scope: Postman-level tests for MVP flows
- Deliverables: test checklist execution
- Dependencies: A1..F1
- Verify: all checklist items pass
