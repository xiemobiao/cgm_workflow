# API DTO and Example Payloads (MVP)

## Conventions
- All timestamps use ISO8601 in UTC.
- IDs are UUID strings.
- JSON examples are minimal; fields can be extended.

## Common Response (Recommended)
```
{
  "success": true,
  "data": { "...": "..." },
  "error": null
}
```

## Common Error (Recommended)
```
{
  "success": false,
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

## Auth

### POST /api/auth/login
Request:
```
{
  "email": "user@example.com",
  "password": "********"
}
```

Response:
```
{
  "success": true,
  "data": {
    "token": "jwt_token",
    "user": {
      "id": "uuid",
      "name": "Alice",
      "email": "user@example.com",
      "role": "Admin"
    }
  },
  "error": null
}
```

### GET /api/auth/me
Response:
```
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Alice",
    "email": "user@example.com",
    "role": "Admin"
  },
  "error": null
}
```

## Projects

### POST /api/projects
Request:
```
{
  "name": "CGM SDK",
  "type": "SDK",
  "status": "active"
}
```

Response:
```
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "CGM SDK",
    "type": "SDK",
    "status": "active"
  },
  "error": null
}
```

## Requirements and Workflows

### POST /api/requirements/sync
Request:
```
{
  "projectId": "uuid",
  "integrationId": "uuid"
}
```

Response:
```
{
  "success": true,
  "data": {
    "synced": 12,
    "createdWorkflows": 8
  },
  "error": null
}
```

### POST /api/workflows
Request:
```
{
  "projectId": "uuid",
  "requirementId": "uuid"
}
```

Response:
```
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "active",
    "currentStage": "Development"
  },
  "error": null
}
```

### PATCH /api/workflows/{id}/status
Request:
```
{
  "status": "blocked",
  "reason": "Waiting for test device"
}
```

Response:
```
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "blocked"
  },
  "error": null
}
```

## Gates and Artifacts

### POST /api/workflows/{id}/gates/{gate_id}/approve
Request:
```
{
  "approverId": "uuid",
  "comment": "Reviewed and approved"
}
```

Response:
```
{
  "success": true,
  "data": {
    "gateId": "uuid",
    "status": "approved",
    "decidedAt": "2025-01-01T10:00:00Z"
  },
  "error": null
}
```

### POST /api/workflows/{id}/gates/{gate_id}/override
Request:
```
{
  "approverId": "uuid",
  "reason": "Urgent hotfix"
}
```

Response:
```
{
  "success": true,
  "data": {
    "gateId": "uuid",
    "status": "overridden"
  },
  "error": null
}
```

### POST /api/artifacts
Request:
```
{
  "workflowId": "uuid",
  "type": "TestReport",
  "url": "https://files.example.com/report.pdf",
  "ownerId": "uuid"
}
```

Response:
```
{
  "success": true,
  "data": {
    "id": "uuid",
    "type": "TestReport",
    "url": "https://files.example.com/report.pdf"
  },
  "error": null
}
```

## Integrations

### POST /api/integrations
Request:
```
{
  "projectId": "uuid",
  "type": "pingcode",
  "status": "enabled",
  "secretsRef": "secret://pingcode-token"
}
```

Response:
```
{
  "success": true,
  "data": {
    "id": "uuid",
    "type": "pingcode",
    "status": "enabled"
  },
  "error": null
}
```

### PUT /api/integrations/{id}/mapping
Request:
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

Response:
```
{
  "success": true,
  "data": {
    "integrationId": "uuid",
    "updatedAt": "2025-01-01T10:00:00Z"
  },
  "error": null
}
```

## CI

### POST /api/pipelines/trigger
Request:
```
{
  "projectId": "uuid",
  "ref": "release/02.00.00.00",
  "variables": {
    "ENV": "staging"
  }
}
```

Response:
```
{
  "success": true,
  "data": {
    "pipelineId": "external_id",
    "status": "running",
    "url": "https://gitlab.example.com/pipelines/123"
  },
  "error": null
}
```

## Logs

### POST /api/logs/upload
Request (multipart/form-data):
- `projectId`: uuid
- `file`: decoded JSONL file
- `fileName`: optional override

Response:
```
{
  "success": true,
  "data": {
    "logFileId": "uuid",
    "status": "queued"
  },
  "error": null
}
```

### GET /api/logs/events/search
Query:
- projectId
- eventName (optional)
- startTime, endTime (ISO8601)
- appId (optional)
- sdkVersion (optional)
- level (optional)
- limit, cursor (optional)

Response:
```
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "eventName": "BLE start searching",
        "level": 1,
        "timestampMs": 1713459600000,
        "sdkVersion": "v3.5.1"
      }
    ],
    "nextCursor": "cursor"
  },
  "error": null
}
```

## Incidents

### POST /api/incidents
Request:
```
{
  "projectId": "uuid",
  "title": "BLE reconnect failure",
  "severity": "high",
  "status": "open",
  "startTime": "2025-01-01T10:00:00Z"
}
```

Response:
```
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "open"
  },
  "error": null
}
```

### PATCH /api/incidents/{id}
Request:
```
{
  "status": "resolved",
  "endTime": "2025-01-02T12:00:00Z"
}
```

Response:
```
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "resolved"
  },
  "error": null
}
```
