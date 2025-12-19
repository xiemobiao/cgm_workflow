# Product Scope (MVP)

## Goals
- Unify CGM workflow across SDK and app projects
- Track requirement to release with clear gates and evidence
- Reduce time to diagnose production issues

## Non-Goals
- Full CI management or code hosting
- Device lab scheduling or hardware automation
- Deep AI analysis for requirements

## Primary Users
- PM: requirement intake and stage tracking
- Dev: implementation, evidence, and log search
- QA: test plans and gate approvals
- Support: incident handling and diagnosis

## Key User Stories
- As a PM, I can sync a requirement and create a workflow instance
- As a Dev, I can attach PR, test report, and release evidence
- As QA, I can approve gates based on evidence and test results
- As Support, I can link incidents to logs and workflows
- As Admin, I can configure templates and integrations

## Success Metrics
- Requirement to release lead time decreases
- Incident diagnosis time decreases
- Gate compliance rate increases

## Assumptions
- Requirements come from PingCode (sync or manual import)
- Logs are uploaded as decoded JSONL
