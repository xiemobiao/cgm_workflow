# Database Migration Draft (PostgreSQL)

## Notes
- Use UUID as primary keys
- Use JSONB for flexible log payloads and mappings
- Use soft delete for core business records

## Tables

### users
- id uuid PK
- email text unique not null
- name text not null
- status text not null
- created_at timestamp not null
- updated_at timestamp not null

### roles
- id uuid PK
- name text unique not null

### projects
- id uuid PK
- name text not null
- type text not null
- status text not null
- created_at timestamp not null
- updated_at timestamp not null

### project_members
- id uuid PK
- project_id uuid FK -> projects.id
- user_id uuid FK -> users.id
- role_id uuid FK -> roles.id
- created_at timestamp not null

### requirements
- id uuid PK
- project_id uuid FK -> projects.id
- external_id text
- title text not null
- status text not null
- source_status text null
- source text not null
- owner text null
- priority text null
- tags jsonb null
- deleted_at timestamp null
- created_at timestamp not null
- updated_at timestamp not null

### workflow_templates
- id uuid PK
- name text not null
- project_type text not null
- definition jsonb not null
- created_at timestamp not null
- updated_at timestamp not null

### workflow_instances
- id uuid PK
- project_id uuid FK -> projects.id
- requirement_id uuid FK -> requirements.id
- status text not null
- created_at timestamp not null
- updated_at timestamp not null

### stage_instances
- id uuid PK
- workflow_id uuid FK -> workflow_instances.id
- stage_name text not null
- status text not null
- created_at timestamp not null
- updated_at timestamp not null

### gates
- id uuid PK
- stage_instance_id uuid FK -> stage_instances.id
- status text not null
- approver_id uuid FK -> users.id
- decision_reason text null
- decided_at timestamp null
- created_at timestamp not null

### artifacts
- id uuid PK
- workflow_id uuid FK -> workflow_instances.id
- type text not null
- url text not null
- owner_id uuid FK -> users.id
- created_at timestamp not null

### integration_configs
- id uuid PK
- project_id uuid FK -> projects.id
- type text not null
- status text not null
- secrets_ref text not null
- mapping jsonb null
- last_sync_at timestamp null
- last_error text null
- created_by uuid FK -> users.id
- created_at timestamp not null
- updated_at timestamp not null

### pipeline_runs
- id uuid PK
- project_id uuid FK -> projects.id
- external_id text
- status text not null
- url text
- created_at timestamp not null
- updated_at timestamp not null

### log_files
- id uuid PK
- project_id uuid FK -> projects.id
- file_name text not null
- file_size bigint not null
- status text not null
- source_device text null
- parser_version text null
- uploaded_at timestamp not null

### log_events
- id uuid PK
- log_file_id uuid FK -> log_files.id
- timestamp_ms bigint not null
- level int not null
- event_name text not null
- sdk_version text
- app_id text
- terminal_info text
- thread_name text
- thread_id bigint
- is_main_thread boolean
- msg_json jsonb
- raw_line text
- created_at timestamp not null

### incidents
- id uuid PK
- project_id uuid FK -> projects.id
- title text not null
- severity text not null
- status text not null
- start_time timestamp not null
- end_time timestamp null
- deleted_at timestamp null
- created_at timestamp not null
- updated_at timestamp not null

### incident_log_links
- id uuid PK
- incident_id uuid FK -> incidents.id
- log_event_id uuid FK -> log_events.id

## Indexes
- requirements(project_id, status)
- workflow_instances(project_id, status)
- stage_instances(workflow_id)
- gates(stage_instance_id, status)
- artifacts(workflow_id)
- integration_configs(project_id, type)
- pipeline_runs(project_id, status)
- log_files(project_id, uploaded_at)
- log_events(log_file_id)
- log_events(event_name, timestamp_ms)
- log_events(app_id, timestamp_ms)
- log_events(sdk_version, event_name)
- incidents(project_id, status)
- incident_log_links(incident_id)

## Migration Tips
- Use UTC timestamps
- Add default values for status fields
- Add `updated_at` trigger for mutable tables
