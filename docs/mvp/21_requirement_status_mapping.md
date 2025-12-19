# Requirement Status Normalization (MVP)

## Purpose
Define how external requirement statuses are normalized into internal workflow
stages and `requirement.status`.

## Inputs
- `source_status` (raw external status string)
- `statusMap` (external status -> internal stage)
- workflow stage and gate states

## Outputs
- `requirement.source_status` (raw)
- `requirement.status` (normalized)
- workflow `currentStage`

## Normalization Rules
1. Always store raw external status in `requirement.source_status` if provided.
2. If `statusMap` contains the external status:
   - Map to internal stage and move workflow forward if needed.
   - Backward transitions are ignored unless Admin override.
3. If `statusMap` does not contain the external status:
   - Keep current stage and `requirement.status`.
   - Record a warning in audit logs.
4. `requirement.status` is derived from stage:
   - No workflow instance -> `draft`
   - Stage in Requirement/Design/Development -> `in_progress`
   - Stage in Test -> `testing`
   - Stage in Release or Diagnosis -> `done` only after release gate approved

## Default Mapping (Example)
- "In Progress" -> Development -> `in_progress`
- "Testing" -> Test -> `testing`
- "Done" -> Release -> `done` (after release gate)
- "已发布" -> Release -> `done` (after release gate)
- "完成" -> Release -> `done` (after release gate)

## Edge Cases
- Unknown status: keep stage, update `source_status`, audit warning.
- Multiple integrations: latest update wins; keep previous `source_status` history in audit.
- Manual edits: Admin can override stage and status, recorded in audit.
