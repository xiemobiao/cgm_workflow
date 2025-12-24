# CGM SDK Debug Platform Spec Pack

## Version
- v0.2

## Scope
- SDK 日志调试诊断平台
- 日志上传、解析、搜索
- 蓝牙设备会话追踪与异常检测
- 事故管理与已知问题库
- Input logs are decoded JSONL per `../logging/cgm_log_format_spec.md`

## Default Stack
- Language: TypeScript
- Web: Next.js
- API: NestJS
- DB: PostgreSQL
- Queue: Redis + BullMQ
- Storage: MinIO (S3 compatible)

## Deliverables
- `03_roles_permissions.md`
- `04_data_model.md`
- `06_api_outline.md`
- `07_acceptance_criteria.md`

## References
- `../logging/cgm_log_format_spec.md`
