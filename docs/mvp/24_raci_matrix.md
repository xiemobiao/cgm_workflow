# RACI Matrix (MVP)

## Purpose
Clarify who is Responsible, Accountable, Consulted, and Informed for key
workflow activities in the CGM workflow system.

## Legend
- R = Responsible (does the work)
- A = Accountable (owns the outcome)
- C = Consulted (provides input)
- I = Informed (kept updated)

## RACI Table
| Activity | Admin | PM | Dev | QA | Release | Support | Viewer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Project and workspace setup | A/R | C | I | I | I | I | I |
| Integration configuration | A/R | C | C | I | I | I | I |
| Requirement sync and mapping | A | R | C | I | I | I | I |
| Requirement triage and priority | I | A/R | C | C | I | I | I |
| Workflow instance creation | A | R | C | C | I | I | I |
| Stage updates during delivery | I | A | R | C | I | I | I |
| Test gate approval | C | I | I | A/R | I | I | I |
| Release gate approval | C | I | I | C | A/R | I | I |
| Development implementation | I | C | A/R | I | I | I | I |
| Test execution and report | I | I | C | A/R | I | I | I |
| Log upload for diagnosis | A | I | C | C | I | R | I |
| Log parsing and ingestion | A | I | R | C | I | C | I |
| Incident creation and triage | I | I | C | C | I | A/R | I |
| Diagnosis report and summary | A | I | C | C | I | R | I |
| Release rollout | I | I | C | C | A/R | I | I |
| Access management | A/R | I | I | I | I | I | I |
| Audit review | A/R | I | I | I | I | I | I |

## Notes
- Use a single Accountable role per activity.
- RACI may be adjusted per project, but defaults must be documented.
