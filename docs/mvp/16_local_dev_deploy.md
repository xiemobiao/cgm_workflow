# Local Development and Deployment (MVP)

## Scope
This guide describes a local dev setup and a minimal self-hosted deployment
approach for the CGM workflow web system.

## Prerequisites
- Node.js LTS (>= 20)
- pnpm (or npm/yarn)
- Docker + Docker Compose
- PostgreSQL 14+
- Redis 6+
- MinIO (S3 compatible) or local filesystem storage

## Environment Variables (Example)
```
DATABASE_URL=postgresql://cgm_user:cgm_pass@localhost:5432/cgm_workflow
REDIS_URL=redis://localhost:6379
STORAGE_DRIVER=minio
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minio
MINIO_SECRET_KEY=minio123
MINIO_BUCKET=cgm-logs
JWT_SECRET=replace_with_strong_secret
WEB_BASE_URL=http://localhost:3000
API_BASE_URL=http://localhost:3001
```

## Local Dev (Recommended)

### 1) Start Dependencies
Use Docker Compose for Postgres/Redis/MinIO:
```
# docker-compose.yml (example)
services:
  postgres:
    image: postgres:14
    environment:
      POSTGRES_USER: cgm_user
      POSTGRES_PASSWORD: cgm_pass
      POSTGRES_DB: cgm_workflow
    ports:
      - "5432:5432"
  redis:
    image: redis:6
    ports:
      - "6379:6379"
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio123
    ports:
      - "9000:9000"
      - "9001:9001"
```

### 2) Install Dependencies
```
# at repo root
pnpm install
```

### 3) Run Migrations
```
# example (adjust to your ORM)
pnpm run db:migrate
```

### 4) Start API and Web
```
# API (NestJS)
pnpm run api:dev

# Web (Next.js)
pnpm run web:dev
```

## Deployment (Minimal)

### Option A: Single VM + Docker Compose
- Build API and Web images
- Run Postgres/Redis/MinIO as managed services or containers
- Use Nginx for TLS termination and routing

### Option B: Separate Services
- API + Web in containers
- DB/Redis/MinIO on managed services
- CI deploy pipeline (GitLab) to update images

## Operational Notes
- Use UTC for all timestamps
- Enable audit logging for gate approvals and integration changes
- Rotate JWT secrets and MinIO credentials regularly
- Backup Postgres daily; keep at least 7 days

## Health Checks
- API: /health
- Web: /health
- Background jobs: queue length and worker heartbeats
