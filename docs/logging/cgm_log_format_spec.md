# CGM Logan Log Format Spec (SDK and App)

## Scope
This document defines the unified log format, parsing rules, and storage schema
for CGM SDK and app logs generated via Logan. It is based on the current SDK
implementation and log event list used by the CGM Bluetooth SDK.

## Source of Truth
- Event dictionary: SDK LogEvent enum (eventEnglishName)
- Event list spreadsheet: SDK log event list (xlsx)
- Writer: EventLogger writes the inner JSON in field `c`
- Logan writer: CLogan constructs the outer JSON line

## Input Assumption (for the Web Platform)
- The platform receives decoded JSON lines (JSONL) as input.
- Logan native files are decoded by the backend before ingestion.

## Raw Log File Facts (SDK/App side)
- Logs are stored by Logan in native files (no extension).
- Default directories (Android):
  - External: `context.getExternalFilesDir(null)/SibBluetooth/log/file`
  - Internal: `context.filesDir/SibBluetooth/log/file`
- Export bundles files into a zip (`sibble_logs_YYYYMMDD_HHMMSS.zip`).

## Parsed Line Format (decoded JSON lines)
Each log line is a JSON object with the following outer fields:

- `c` (string): inner JSON string produced by EventLogger
- `f` (int): Logan log level
- `l` (int64): local timestamp in milliseconds
- `n` (string): thread name
- `i` (int64): thread id
- `m` (bool/int): is main thread

Example (outer JSON line):

```json
{"l":1713459600000,"f":1,"c":"{\"msg\":{},\"event\":\"SDK init start\",\"sdkInfo\":\"v3.5.1\",\"terminalInfo\":\"Pixel 8 / Android 14\"}","n":"main","i":1,"m":true}
```

## Inner JSON in Field `c`
The `c` field is a JSON-encoded string. After parsing, it has these keys:

- `event` (string): eventEnglishName
- `msg` (object or primitive): event data payload
- `sdkInfo` (string): SDK version
- `terminalInfo` (string): device model and OS
- `appInfo` (string, optional): app id if provided during init

Notes:
- `msg` is not always an object. It may be a string/number if caller passes
  a single `data` field.
- `appInfo` is optional and may be absent in SDK-only usage.
- Source (BLE/APP/SYS) is not written into JSON; derive it from event mapping
  if needed.

## Log Level Mapping
`f` maps to levels defined by LogEvent:
- `1` = INFO
- `2` = DEBUG
- `3` = WARN
- `4` = ERROR

## Parsing Rules
**Step 1: parse outer JSON** to get `c`, `f`, `l`, `n`, `i`, `m`.
**Step 2: parse inner JSON** from `c` into `event`, `msg`, `sdkInfo`,
`terminalInfo`, `appInfo`.

Pseudocode (high level):

```
for each log_line in decoded_file:
  outer = parse_json(log_line)
  inner = parse_json(outer.c)
  emit normalized_event
```

## Normalized Event Shape
Recommended normalized fields for the web platform:
- `event_name` (string) from `event`
- `event_level` (int) from `f`
- `timestamp_ms` (int64) from `l`
- `sdk_version` (string) from `sdkInfo`
- `app_id` (string) from `appInfo`
- `terminal_info` (string) from `terminalInfo`
- `thread_name` (string) from `n`
- `thread_id` (int64) from `i`
- `is_main_thread` (bool) from `m`
- `msg_json` (json) from `msg`
- `source` (enum, optional) derived by event mapping
- `raw_line` (string) optional for debugging

## Storage Schema Draft
### Table: log_file
- `id` (uuid)
- `project_id` (uuid)
- `file_name` (string)
- `file_size` (int64)
- `uploaded_at` (timestamp)
- `source_device` (string, optional)
- `parser_version` (string)
- `status` (enum: queued, parsed, failed)

### Table: log_event
- `id` (uuid)
- `log_file_id` (uuid)
- `timestamp_ms` (int64)
- `level` (int)
- `event_name` (string)
- `sdk_version` (string)
- `app_id` (string, nullable)
- `terminal_info` (string)
- `thread_name` (string)
- `thread_id` (int64)
- `is_main_thread` (bool)
- `msg_json` (json)
- `raw_line` (string, optional)
- `created_at` (timestamp)

### Table: incident (minimal for diagnosis)
- `id` (uuid)
- `project_id` (uuid)
- `title` (string)
- `severity` (enum)
- `status` (enum)
- `start_time` (timestamp)
- `end_time` (timestamp, nullable)

### Table: incident_log_link
- `incident_id` (uuid)
- `log_event_id` (uuid)

## Index Suggestions
- `log_event(project_id, timestamp_ms)`
- `log_event(event_name, timestamp_ms)`
- `log_event(app_id, timestamp_ms)`
- `log_event(sdk_version, event_name)`
- `log_event(log_file_id)`

## Caveats and Quality Checks
- If inner JSON parsing fails, keep `raw_line` and mark status `failed`.
- `msg` type is dynamic; treat as JSON blob.
- `terminalInfo` is a free-form string; do not parse with strict schema.
- Event dictionary updates must be tracked by SDK version.
