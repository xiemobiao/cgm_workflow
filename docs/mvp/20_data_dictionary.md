# Data Dictionary (MVP)

## Status Enums

### project.status
- active
- archived

### workflow.status
- active
- blocked
- done

### stage.status
- pending
- in_progress
- done

### gate.status
- pending
- approved
- rejected
- overridden

### requirement.status
- draft
- in_progress
- testing
- done
Note: normalized from workflow stage (see `21_requirement_status_mapping.md`)

### incident.status
- open
- investigating
- resolved
- closed

### incident.severity
- low
- medium
- high
- critical

### log_file.status
- queued
- parsed
- failed

### integration.status
- enabled
- disabled
- error

## Type Enums

### project.type
- SDK
- App

### integration.type
- pingcode
- feishu
- gitlab

### artifact.type
- PRD
- TechSpec
- TestPlan
- TestReport
- ReleaseChecklist
- Runbook
- LogPackage

## Log Levels

### log_event.level
- 1 (INFO)
- 2 (DEBUG)
- 3 (WARN)
- 4 (ERROR)

## Stage Names
- Requirement
- Design
- Development
- Test
- Release
- Diagnosis

## Non-Enum Fields

### requirement.source_status
- free-form external status (raw)

### requirement.priority
- free-form (e.g., P0, P1, P2)

### requirement.tags
- array of strings

## Common Fields

### timestamps
- created_at, updated_at: ISO8601 (UTC)
- start_time, end_time: ISO8601 (UTC)

### identifiers
- id, project_id, user_id: UUID
