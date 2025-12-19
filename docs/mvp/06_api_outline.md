# API Outline (MVP)

## Auth
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me

## Projects and Templates
- GET /api/projects
- POST /api/projects
- GET /api/templates
- POST /api/templates

## Requirements and Workflows
- POST /api/requirements/sync
- GET /api/workflows
- POST /api/workflows
- PATCH /api/workflows/{id}/status

## Gates and Artifacts
- POST /api/workflows/{id}/gates/{gate_id}/approve
- POST /api/workflows/{id}/gates/{gate_id}/override
- POST /api/artifacts

## CI and Integrations
- POST /api/integrations
- GET /api/integrations/{id}
- PUT /api/integrations/{id}
- PUT /api/integrations/{id}/mapping
- POST /api/pipelines/trigger
- GET /api/pipelines/{id}

## Logs and Incidents
- POST /api/logs/upload
- GET /api/logs/events/search
- POST /api/incidents
- PATCH /api/incidents/{id}
