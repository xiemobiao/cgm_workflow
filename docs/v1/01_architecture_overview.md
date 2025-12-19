# Architecture Overview (V1)

## Goals
- Separate API, Web, and background jobs
- Isolate integrations and log ingestion
- Provide a stable platform for workflow, logs, and incidents

## Components
- Web App (Next.js)
- API Service (NestJS)
- Worker Service (queue consumers)
- PostgreSQL (primary DB)
- Redis (queues, cache)
- MinIO/S3 (file storage)

## Data Flows
1) Requirement sync -> API -> DB -> workflow instance
2) Gate approval -> API -> audit log
3) Log upload -> Storage -> Worker parse -> DB
4) Incident create -> API -> link to log events

## Integration Points
- PingCode: requirements sync
- Feishu: notifications
- GitLab: CI trigger and status polling

## Security Boundaries
- Public: Web UI and API gateway
- Private: DB, Redis, Storage, Workers
- Secrets: token vault or encrypted config
