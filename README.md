# CGM Workflow Platform

Self-hosted workflow system for CGM SDK and app development.

## Structure
- `apps/api`: NestJS API
- `apps/web`: Next.js web app
- `docs/mvp`: MVP specification pack
- `docs/v1`: Post-MVP docs
- `docs/logging`: log format spec

## Quick Start

### 1) Install
```
npm install --prefix apps/api
npm install --prefix apps/web
```

### 2) Run
```
npm run api:dev
npm run web:dev
```

### 3) Scripts (Root)
```
api:dev     Start NestJS dev server
api:build   Build API
api:start   Start API (prod)
web:dev     Start Next dev server
web:build   Build Web
web:start   Start Web (prod)
```

## Docs
- `docs/mvp/README_INDEX.md`
- `docs/v1/README.md`
- `docs/logging/cgm_log_format_spec.md`
