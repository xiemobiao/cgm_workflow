# Risk Register and Response Matrix (MVP)

## Purpose
Track delivery and operational risks for the MVP and define default responses.

## Risk Register
| ID | Risk | Likelihood | Impact | Early Signal | Response | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | External integration fields are incomplete or change unexpectedly | Medium | High | Sync errors, unmapped fields | Mitigate: keep raw fields, add mapping UI | Admin | Open |
| R2 | Requirement status mapping drifts from external tools | Medium | Medium | Status not matching workflow stage | Mitigate: audit + mapping review | PM | Open |
| R3 | Log upload volume exceeds storage or ingest capacity | Medium | High | Queue backlog, storage alerts | Mitigate: throttling + retention policy | Admin | Open |
| R4 | Log schema changes break parsing or search | Low | High | Parse errors, missing fields | Mitigate: versioned parser + fallback to raw | Dev | Open |
| R5 | Permission misconfiguration causes data exposure | Low | High | Access anomalies, audit alerts | Avoid: least privilege, reviews | Admin | Open |
| R6 | Log search is too slow for diagnosis | Medium | Medium | Slow queries, timeouts | Mitigate: indexing + query limits | Dev | Open |
| R7 | Authentication and access control lacks enterprise needs | Medium | Medium | User onboarding friction | Mitigate: plan SSO in v1 | Admin | Open |
| R8 | Incident workflow not adopted by teams | Medium | Medium | Incidents tracked outside system | Mitigate: training + templates | Support | Open |
| R9 | Data retention requirements are unclear | Low | Medium | Legal or audit requests | Mitigate: configurable retention | Admin | Open |
| R10 | API contract tests are incomplete | Medium | Medium | Breaking changes in releases | Mitigate: add contract tests gate | QA | Open |

## Response Options
- Avoid: change scope or design to remove the risk.
- Mitigate: reduce probability or impact.
- Transfer: move risk to vendor or contract.
- Accept: monitor and prepare contingency.

## Response Matrix
| Likelihood \ Impact | Low | Medium | High |
| --- | --- | --- | --- |
| Low | Accept | Monitor | Mitigate |
| Medium | Monitor | Mitigate | Mitigate or Avoid |
| High | Mitigate | Avoid or Mitigate | Avoid or Transfer |

## Monitoring Cadence
- Review the register bi-weekly during MVP build.
- Escalate any High impact risk to Admin and PM immediately.
