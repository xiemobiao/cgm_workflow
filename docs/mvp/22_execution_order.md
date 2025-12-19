# MVP Execution Order and Critical Path

## Principle
- Build along dependency order
- Unblock core workflow before integrations
- Logs and incidents are parallel once storage is ready

## Critical Path (Shortest to MVP)
1. A1 Project Bootstrap
2. A2 Database Layer
3. A3 Auth and RBAC
4. B1 Projects and Members
5. C1 Integration Config
6. B2 Requirements Sync (stub + mapping validation)
7. B3 Workflow Instances
8. B4 Gates and Approvals
9. F1 Storage Adapter
10. D1 Log Upload
11. D2 Log Parse and Search
12. D3 Incident Management
13. G1 API Contract Tests

## Parallelizable Tasks
- B5 Artifacts (after B3)
- C2 CI Trigger (after C1)
- E1 Audit Log (after A2)

## Frontend Sequence (aligned to backend)
1. A1 App Shell and Routing
2. A2 Design System
3. B2 Requirements Page
4. B3 Workflows Page + Detail
5. B4 Logs Page
6. B5 Incidents Page
7. B6 Integrations + Mapping UI
8. E1 UI Smoke Test

## Exit Criteria
- Auth + RBAC working
- Workflow + gates functional
- Logs searchable by event name and time range
- Incidents link to logs
