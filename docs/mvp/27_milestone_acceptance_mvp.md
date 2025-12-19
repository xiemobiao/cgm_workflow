# Milestone Acceptance (MVP Applied)

This file applies the milestone acceptance template to the MVP timeline
milestones. Evidence links and sign-off can be filled during delivery.

## Milestone 1: Week 1 - Foundation + Skeleton

### Milestone Info
- Milestone name: Week 1 - Foundation + Skeleton
- Owner: TBD
- Planned date: TBD
- Actual date: TBD
- Related requirements: A1 Project Bootstrap, A2 Database Layer, A3 Auth and RBAC
- Related workflow stages: Requirement, Design, Development

### Objectives
- Backend and frontend bootstrap
- Database migrations ready
- Auth + RBAC in place

### In-Scope Deliverables
- NestJS app skeleton + /health
- Next.js shell with protected routes
- Database migration scripts
- Basic auth endpoints

### Out-of-Scope
- Feature modules beyond skeleton

### Acceptance Criteria
- [ ] /health endpoint returns OK
- [ ] DB migrations apply cleanly on a fresh database
- [ ] Auth endpoints issue tokens and validate sessions
- [ ] RBAC guards enforce role-based access
- [ ] App shell loads with protected routing

### Validation Evidence
| Evidence | Link or Location | Owner | Date |
| --- | --- | --- | --- |
| /health check output |  |  |  |
| Migration execution log |  |  |  |
| Auth smoke test notes |  |  |  |
| Protected route screenshot |  |  |  |

### Quality and Readiness Checklist
- [ ] No High severity bugs open
- [ ] Access control verified
- [ ] Rollback plan documented and reviewed

### Risks and Exceptions
- Risk or exception:
- Mitigation:
- Approval to proceed:

### Sign-off
| Role | Name | Decision (Approve/Reject) | Date | Notes |
| --- | --- | --- | --- | --- |
| Admin |  |  |  |  |
| PM |  |  |  |  |
| Dev |  |  |  |  |
| QA |  |  |  |  |
| Release |  |  |  |  |

## Milestone 2: Week 2 - Core Workflow + Logs

### Milestone Info
- Milestone name: Week 2 - Core Workflow + Logs
- Owner: TBD
- Planned date: TBD
- Actual date: TBD
- Related requirements: B1 Projects and Members, B2 Requirements Sync, B3 Workflow Instances, B4 Gates and Approvals, F1 Storage Adapter, D1 Log Upload, D2 Log Parse and Search
- Related workflow stages: Development, Test

### Objectives
- Workflow lifecycle and gates
- Logs upload + search

### In-Scope Deliverables
- Projects/Requirements/Workflows APIs
- Gate approve/override
- JSONL log upload + search
- UI pages for Workflows and Logs

### Out-of-Scope
- External integrations

### Acceptance Criteria
- [ ] Workflow instances created from requirements
- [ ] Gates can be approved/overridden with audit entries
- [ ] Decoded JSONL logs upload successfully
- [ ] Log search by event name and time range
- [ ] Workflows and Logs pages pass UI smoke check

### Validation Evidence
| Evidence | Link or Location | Owner | Date |
| --- | --- | --- | --- |
| Workflow API test report |  |  |  |
| Gate approval audit log |  |  |  |
| Log upload sample and query |  |  |  |
| UI smoke test notes |  |  |  |

### Quality and Readiness Checklist
- [ ] No High severity bugs open
- [ ] Performance baselines met
- [ ] Audit logs reviewed for key actions

### Risks and Exceptions
- Risk or exception:
- Mitigation:
- Approval to proceed:

### Sign-off
| Role | Name | Decision (Approve/Reject) | Date | Notes |
| --- | --- | --- | --- | --- |
| Admin |  |  |  |  |
| PM |  |  |  |  |
| Dev |  |  |  |  |
| QA |  |  |  |  |
| Release |  |  |  |  |

## Milestone 3: Week 3 - Integrations + Incidents

### Milestone Info
- Milestone name: Week 3 - Integrations + Incidents
- Owner: TBD
- Planned date: TBD
- Actual date: TBD
- Related requirements: C1 Integration Config, B2 Requirements Sync, D3 Incident Management
- Related workflow stages: Development, Diagnosis

### Objectives
- Integration config and mapping
- Incident management

### In-Scope Deliverables
- Integration CRUD + mapping UI
- Requirements sync stub
- Incident CRUD + linkage to logs
- UI pages for Integrations and Incidents

### Out-of-Scope
- Full external sync automation

### Acceptance Criteria
- [ ] Integration configs saved with mapping rules
- [ ] Requirements sync stub runs without errors
- [ ] Incidents created and linked to logs
- [ ] Integrations and Incidents pages pass UI smoke check

### Validation Evidence
| Evidence | Link or Location | Owner | Date |
| --- | --- | --- | --- |
| Mapping UI screenshot |  |  |  |
| Sync stub run log |  |  |  |
| Incident sample record |  |  |  |
| UI smoke test notes |  |  |  |

### Quality and Readiness Checklist
- [ ] No High severity bugs open
- [ ] Access control verified
- [ ] Audit logs reviewed for key actions

### Risks and Exceptions
- Risk or exception:
- Mitigation:
- Approval to proceed:

### Sign-off
| Role | Name | Decision (Approve/Reject) | Date | Notes |
| --- | --- | --- | --- | --- |
| Admin |  |  |  |  |
| PM |  |  |  |  |
| Dev |  |  |  |  |
| QA |  |  |  |  |
| Release |  |  |  |  |

## Milestone 4: Week 4 - Hardening + UAT

### Milestone Info
- Milestone name: Week 4 - Hardening + UAT
- Owner: TBD
- Planned date: TBD
- Actual date: TBD
- Related requirements: G1 API Contract Tests, E1 Audit Log
- Related workflow stages: Test, Release

### Objectives
- E2E checklist, bug fixes
- Basic observability and audit

### In-Scope Deliverables
- API test checklist executed
- Audit log recorded for gates
- Deployment guide validated

### Out-of-Scope
- Post-MVP optimization

### Acceptance Criteria
- [ ] API contract tests executed and recorded
- [ ] Audit log entries exist for gate actions
- [ ] Deployment guide steps validated end-to-end
- [ ] UI smoke test complete with no blockers

### Validation Evidence
| Evidence | Link or Location | Owner | Date |
| --- | --- | --- | --- |
| API contract results |  |  |  |
| Audit log export |  |  |  |
| Deployment guide notes |  |  |  |
| UI smoke test notes |  |  |  |

### Quality and Readiness Checklist
- [ ] No High severity bugs open
- [ ] Performance baselines met
- [ ] Access control verified
- [ ] Rollback plan documented and reviewed

### Risks and Exceptions
- Risk or exception:
- Mitigation:
- Approval to proceed:

### Sign-off
| Role | Name | Decision (Approve/Reject) | Date | Notes |
| --- | --- | --- | --- | --- |
| Admin |  |  |  |  |
| PM |  |  |  |  |
| Dev |  |  |  |  |
| QA |  |  |  |  |
| Release |  |  |  |  |
