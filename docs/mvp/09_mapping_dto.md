# Integration Mapping DTO/Schema (MVP)

## Endpoint
- PUT `/api/integrations/{id}/mapping`

## Request DTO
```
{
  "fieldMap": {
    "external_id": "string",
    "title": "string",
    "status": "string",
    "type": "string | null",
    "priority": "string | null",
    "owner": "string | null",
    "tags": "string | null"
  },
  "statusMap": {
    "<externalStatus>": "<internalStage>"
  },
  "filters": {
    "typeContains": "string",
    "tagContains": "string | null"
  }
}
```

## Response DTO
```
{
  "integrationId": "uuid",
  "mapping": {
    "fieldMap": { "...": "..." },
    "statusMap": { "...": "..." },
    "filters": { "...": "..." }
  },
  "updatedAt": "iso8601"
}
```

## Validation Rules
- `fieldMap.external_id`, `fieldMap.title`, `fieldMap.status` are required
- `statusMap` must contain at least 1 entry
- `filters.typeContains` is required
- `filters.tagContains` is optional
- `statusMap` keys must be unique
- `internalStage` must be one of:
  - `Requirement`, `Design`, `Development`, `Test`, `Release`, `Diagnosis`

## Errors (suggested)
- `INVALID_MAPPING_REQUIRED_FIELDS`
- `INVALID_STATUS_MAP_EMPTY`
- `INVALID_STAGE_VALUE`
- `INVALID_FILTERS`
