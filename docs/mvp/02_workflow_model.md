# Workflow Model (MVP)

## Stages and Gates
| Stage | Required Artifacts | Gate Rule |
| --- | --- | --- |
| Requirement | PRD, risk notes | DoR satisfied |
| Design | Tech spec, integration notes | Design approved |
| Development | MR link, unit test note | Code review approved |
| Test | Test plan, test report | Tests pass or override |
| Release | Release checklist, version info | Release approved |
| Diagnosis | Runbook, incident link | Incident resolved |

## Definition of Ready (DoR)
- Clear title and scope
- Acceptance criteria listed
- Owner assigned

## Definition of Done (DoD)
- Required artifacts attached
- Gate approved with audit record
- Version and evidence linked

## Artifact Types
- PRD
- TechSpec
- TestPlan
- TestReport
- ReleaseChecklist
- Runbook
- LogPackage (decoded JSONL)

## Gate Overrides
- Allowed only by Release or Admin role
- Must include reason and timestamp
