# CGM Workflow Web MVP Spec Pack

## Version
- v0.1

## Scope
- Self-hosted workflow system for CGM SDK and app work
- Requirement intake, workflow instances, gate approvals, and diagnosis
- Input logs are decoded JSONL per `../logging/cgm_log_format_spec.md`

## Default Stack
- Language: TypeScript
- Web: Next.js
- API: NestJS
- DB: PostgreSQL
- Queue: Redis + BullMQ
- Storage: MinIO (S3 compatible)

## Deliverables
- `01_product_scope.md`
- `02_workflow_model.md`
- `03_roles_permissions.md`
- `04_data_model.md`
- `05_integrations.md`
- `06_api_outline.md`
- `07_acceptance_criteria.md`

## References
- `../logging/cgm_log_format_spec.md`
