# Integration Field Mapping UI (MVP)

## Page: Integration Mapping
**Route**: `/projects/{project_id}/integrations/{integration_id}/mapping`

### Layout
- Left: Integration summary (type, status, last sync, owner)
- Right: Mapping editor with required and optional sections
- Footer: Save, Test Mapping, Reset

### Sections

#### 1) Required Fields
- External ID -> `requirement.external_id`
- Title -> `requirement.title`
- Status -> `requirement.status`

Rules:
- All required mappings must be selected before saving
- If missing, show blocking error

#### 2) Optional Fields
- Type -> `requirement.type`
- Priority -> `requirement.priority`
- Owner -> `requirement.owner`
- Tags -> `requirement.tags`

Rules:
- Optional fields can be left unmapped

#### 3) Value Mapping (Status)
- Define external status values to internal stage status
- Default mapping:
  - In Progress -> Development
  - Testing -> Test
  - Done -> Release

Rules:
- Must cover at least 1 external status
- Duplicate external values are not allowed

#### 4) Filter Rules (Requirement Detection)
- Required: Type contains `Requirement`
- Optional: Tag contains `CGM`

Rules:
- Type filter is mandatory
- Tag filter can be empty

### Actions

**Save**
- Validates required mappings and status mapping rules
- Persists mapping JSON into IntegrationConfig
- Shows success toast and updates last modified time

**Test Mapping**
- Uses a pasted JSON sample (provided by user later)
- Shows mapping result preview (external -> internal fields)
- Does not save any changes

**Reset**
- Restore last saved mapping

### Validation Summary
- Required fields mapped
- Status mapping not empty
- No duplicate external status keys

### Output Structure
Store as JSON:

```
{
  "fieldMap": {
    "external_id": "id",
    "title": "title",
    "status": "status",
    "type": "type",
    "priority": "priority",
    "owner": "owner",
    "tags": "tags"
  },
  "statusMap": {
    "In Progress": "Development",
    "Testing": "Test",
    "Done": "Release"
  },
  "filters": {
    "typeContains": "Requirement",
    "tagContains": "CGM"
  }
}
```
