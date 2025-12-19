# Non-Functional Requirements (V1)

## Performance
- Log search: < 2s for 50k events
- API p95 latency: < 300ms for common reads

## Scalability
- Support multiple projects and tenants
- Horizontal scaling for API and workers

## Availability
- Target uptime: 99.9% for API
- Graceful degradation if integrations fail

## Security
- Enforce RBAC for all project resources
- Audit critical actions and gate decisions

## Data
- Log data stored in JSONB
- Support retention policies per project
