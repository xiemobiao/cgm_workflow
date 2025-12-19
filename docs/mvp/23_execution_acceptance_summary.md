# Execution and Acceptance Summary (MVP)

## Execution Checklist (Order-Aware)

### Backend
- [ ] Bootstrap API (NestJS) and /health
- [ ] Apply DB migrations
- [ ] Enable JWT auth + RBAC guards
- [ ] Project CRUD + members
- [ ] Integration config + mapping save
- [ ] Requirements sync stub + mapping validation
- [ ] Workflow create + stage transitions
- [ ] Gate approve/override + audit entry
- [ ] Storage adapter (MinIO/local)
- [ ] Log upload (decoded JSONL) + parse
- [ ] Log search by eventName/time range
- [ ] Incident CRUD + link to log events

### Frontend
- [ ] App shell + protected routes
- [ ] Design system primitives
- [ ] Requirements list + filters + create workflow
- [ ] Workflow list + detail timeline + gates
- [ ] Logs upload + search + detail
- [ ] Incidents list + detail + linked logs
- [ ] Integrations list + mapping editor

### Integrations
- [ ] PingCode mapping configured (no field samples required)
- [ ] GitLab trigger endpoint ready (polling stub OK)
- [ ] Feishu notification stub

### Quality
- [ ] API checklist executed
- [ ] UI smoke test

## Acceptance Checklist (MVP)

### Functional
- [ ] Requirements sync creates workflow instances
- [ ] Workflow stages and gates are visible and editable
- [ ] Gate approvals and overrides are audit logged
- [ ] Decoded JSONL logs can be uploaded and searched
- [ ] Incidents can link to logs and workflows
- [ ] Admin can configure field mappings

### Access Control
- [ ] Non-approver cannot approve gates
- [ ] Viewer cannot update integrations

### Observability
- [ ] Audit log records critical actions
- [ ] Log parse failures visible in UI

## References
- `01_product_scope.md`
- `07_acceptance_criteria.md`
- `15_api_test_checklist.md`
- `17_backend_tasks.md`
- `18_frontend_tasks.md`
- `22_execution_order.md`
