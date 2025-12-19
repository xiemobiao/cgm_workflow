# Frontend Task Breakdown (MVP)

## Task Group A: Foundation

### A1. App Shell and Routing
- Scope: Next.js app layout, auth guard, routing
- Deliverables: base layout, protected routes
- Dependencies: none
- Verify: login required for protected pages

### A2. Design System (Minimal)
- Scope: typography, buttons, tables, forms, status badges
- Deliverables: shared UI components
- Dependencies: A1
- Verify: components used across pages

## Task Group B: Core Pages

### B1. Dashboard
- Scope: KPI cards, activity feed, quick actions
- Deliverables: dashboard page
- Dependencies: A2
- Verify: renders mock KPIs

### B2. Requirements
- Scope: list + filters + create workflow action
- Deliverables: requirements page
- Dependencies: A2
- Verify: list renders and filters work

### B3. Workflows
- Scope: list + detail (timeline, gates, artifacts)
- Deliverables: workflows page and detail
- Dependencies: A2
- Verify: detail shows stage timeline

### B4. Logs
- Scope: upload + search + detail
- Deliverables: logs page
- Dependencies: A2
- Verify: search results and log detail render

### B5. Incidents
- Scope: list + detail with links
- Deliverables: incidents page
- Dependencies: A2
- Verify: linked logs visible

### B6. Integrations
- Scope: list + mapping editor
- Deliverables: integrations page + mapping UI
- Dependencies: A2
- Verify: mapping editor validates required fields

### B7. Settings
- Scope: roles, templates, audit
- Deliverables: settings page sections
- Dependencies: A2
- Verify: sections render and accept input

## Task Group C: Shared Components

### C1. Data Table
- Scope: sortable table, pagination
- Deliverables: reusable table component
- Dependencies: A2
- Verify: used in requirements/workflows/logs

### C2. Filters Bar
- Scope: dropdowns, search input, date range
- Deliverables: filter component
- Dependencies: A2
- Verify: filter state updates list

### C3. Status Badge
- Scope: status mapping to colors
- Deliverables: badge component
- Dependencies: A2
- Verify: consistent status styling

### C4. File Upload
- Scope: upload widget for JSONL
- Deliverables: upload component
- Dependencies: A2
- Verify: file selection and upload state

## Task Group D: API Integration

### D1. API Client
- Scope: base client with auth token
- Deliverables: API utilities
- Dependencies: A1
- Verify: requests include auth header

### D2. Page Data Hooks
- Scope: hooks for list/detail data
- Deliverables: useWorkflows/useLogs/useRequirements
- Dependencies: D1
- Verify: handles loading/error states

### D3. Mapping Editor Logic
- Scope: mapping state and validation rules
- Deliverables: mapping form logic
- Dependencies: D1, B6
- Verify: required field validation works

## Task Group E: Quality

### E1. UI Smoke Test
- Scope: render each page without crashes
- Deliverables: basic test checklist
- Dependencies: A1..D3
- Verify: pages render under mock data
