---
mode: plan
cwd: /Users/xieyang/Desktop/code/vscode_workpace/cgm_workflow
task: CGM 工作流平台（MVP→V1）开发执行计划
complexity: complex
tool: mcp__mcp-shrimp-task-manager__plan_task
created_at: 2025-12-20T10:34:02+08:00
---

# Plan: CGM 工作流平台（MVP→V1）开发执行计划

🎯 任务概述
本计划基于仓库现状（`apps/api` NestJS + `apps/web` Next.js）与规格文档（`docs/mvp/*`、`docs/v1/*`、`docs/logging/*`），给出一份可落地、可追踪的开发执行路线，优先交付 MVP 的“需求→工作流→闸门→日志→事故”闭环，并在最后阶段补齐 v1 的运维与质量基线。

📋 执行计划
1. Phase 1（0.5–1 天）：工程基线 + 本地开发环境
   - 产出：
     - API：补齐 `/health`；配置/环境变量校验；统一启动端口与基础中间件。
     - DevEnv：明确本地依赖（Postgres/Redis/MinIO）与 `.env.example`；提供最小可用的 docker-compose（或等价启动指引）。
   - 验证：
     - `npm --prefix apps/api run start:dev` 可启动；`GET /health` 返回 200。

2. Phase 2（1–2 天）：数据库层与迁移（关键路径）
   - 产出：
     - 选型并落地 ORM/迁移方案；按迁移草案建立核心表与索引（含 `log_events`/`incidents`）。
     - 形成统一的数据访问约定（repo/transaction、UTC 时间、JSONB 字段规范）。
   - 验证：
     - 在空库可一次性 apply migrations；API 启动可连通 DB。

3. Phase 3（1–2 天）：认证、RBAC、审计（关键路径）
   - 产出：
     - Auth：JWT 登录与会话（login/me），保护资源接口。
     - RBAC：按权限矩阵实现项目级授权；gate approve/override 与 integration 变更必须落审计。
   - 验证：
     - 401/403 行为符合预期；审计记录可查询。

4. Phase 4（1–2 天）：项目/成员 + 集成配置 + Mapping（关键路径）
   - 产出：
     - Projects：项目 CRUD 与成员/角色绑定。
     - Integrations：IntegrationConfig CRUD；Mapping 保存/读取；Mapping 校验规则对齐 UI/DTO 文档。
   - 验证：
     - 可创建项目/成员；可创建 integration 并保存/读取 mapping。

5. Phase 5（1–2 天）：需求同步 Stub + 状态归一化（关键路径）
   - 产出：
     - `POST /api/requirements/sync`：先实现 stub（可不连外部），完成字段映射校验、过滤规则、`source_status` 保留与状态归一化。
   - 验证：
     - sync 返回计数；requirements 入库；未知状态产生可审计告警。

6. Phase 6（1–2 天）：工作流实例、阶段流转、闸门与工件（关键路径）
   - 产出：
     - Workflows：从 requirement 创建 workflow；阶段流转；gate approve/override；artifact 绑定。
   - 验证：
     - 非 approver 角色无法审批；override 需要 Release/Admin 且记录原因与时间。

7. Phase 7（2–3 天，可与 Phase 6 并行部分工作）：存储 + 日志上传/解析/检索 + 事故管理
   - 产出：
     - Storage：MinIO/local 适配层。
     - Logs：decoded JSONL 上传→入队→异步解析→落库；按 eventName/time range 检索；解析失败可见。
     - Incidents：incident CRUD；可链接 log_event（可选 workflow）。
   - 验证：
     - 上传样例 JSONL 后可检索事件；incident 可关联日志并可追溯。

8. Phase 8（2–4 天，与后端联调迭代）：Web MVP（App Shell → 核心页面 → Mapping UI）
   - 产出：
     - Shell：导航/路由、登录与鉴权守卫、最小设计系统、API client。
     - Pages：Requirements/Workflows/Logs/Incidents/Integrations（mapping editor）/Settings。
   - 验证：
     - UI smoke：页面不崩溃；关键链路可走通（创建 workflow、审批 gate、上传并检索 logs、创建 incident）。

9. Phase 9（1–2 天，收尾与 v1 基线）：质量门禁 + 发布运维基线
   - 产出：
     - 测试：按 API checklist 覆盖 MVP 流程；补齐最小 E2E 场景（Auth→Workflow→Gate；Upload→Search→Incident）。
     - CI/CD：lint/test/build → staging → prod manual approval；tag-based release 与回滚方案。
     - 运维：基础观测指标与告警点、备份/保留策略、运行手册模板、API 版本化策略（/api/v1）。
   - 验证：
     - checklist 与 E2E 跑通；CI pipeline 可稳定产物；具备最小回滚与 runbook。

⚠️ 风险与注意事项
- 外部字段变化/缺失导致 sync 失败：以 mapping UI + raw 字段保留 + 审计告警缓解。
- 日志量与解析性能：采用异步 worker、合理索引、分页/限流；按 v1 NFR 提前设定基线。
- 权限配置错误导致数据暴露：最小权限 + 审计 + 权限用例测试（403）。

📎 参考
- `README.md:1`
- `docs/mvp/22_execution_order.md:1`
- `docs/mvp/17_backend_tasks.md:1`
- `docs/mvp/18_frontend_tasks.md:1`
- `docs/mvp/07_acceptance_criteria.md:1`
- `docs/mvp/15_api_test_checklist.md:1`
- `docs/logging/cgm_log_format_spec.md:1`
- `docs/v1/05_cicd_release.md:1`
- `docs/v1/04_observability_alerting.md:1`
- `docs/v1/06_data_retention_backup.md:1`
- `docs/v1/07_runbook_template.md:1`
- `docs/v1/10_api_versioning.md:1`

---

# 执行记录（已完成）

完成时间：2025-12-20

## 已交付（按 Phase 对齐）
1. Phase 1：工程基线 + 本地环境
   - `docker-compose.yml:1`、`.env.example:1`、`README.md:1`、`apps/api/src/main.ts:1`、`apps/web/src/app/health/route.ts:1`

2. Phase 2：数据库层与迁移（Prisma）
   - `apps/api/prisma/schema.prisma:1`
   - `apps/api/prisma/migrations/migration_lock.toml:1`

3. Phase 3：认证、RBAC、审计
   - `apps/api/src/auth/auth.module.ts:1`、`apps/api/src/rbac/rbac.service.ts:1`、`apps/api/src/audit/audit.service.ts:1`
   - 统一响应与异常：`apps/api/src/common/api-response.interceptor.ts:1`、`apps/api/src/common/api-exception.filter.ts:1`

4. Phase 4–6：Projects / Integrations / Requirements / Workflows / Gates / Artifacts
   - `apps/api/src/projects/projects.controller.ts:1`
   - `apps/api/src/integrations/integrations.controller.ts:1`
   - `apps/api/src/requirements/requirements.service.ts:1`
   - `apps/api/src/workflows/workflows.service.ts:1`
   - `apps/api/src/artifacts/artifacts.controller.ts:1`

5. Phase 7：存储 + 日志上传/解析/检索 + 事故管理
   - Storage：`apps/api/src/storage/storage.module.ts:1`
   - Logs：`apps/api/src/logs/logs.controller.ts:1`、`apps/api/src/logs/logs.parser.service.ts:1`
   - Incidents：`apps/api/src/incidents/incidents.controller.ts:1`

6. Phase 8：Web MVP
   - 登录与页面：`apps/web/src/app/login/page.tsx:1`、`apps/web/src/app/requirements/page.tsx:1`、`apps/web/src/app/workflows/[id]/page.tsx:1`、`apps/web/src/app/logs/page.tsx:1`、`apps/web/src/app/incidents/page.tsx:1`、`apps/web/src/app/integrations/page.tsx:1`

7. Phase 9：质量门禁 + CI 基线
   - CI：`.github/workflows/ci.yml:1`
   - MVP e2e（有 DB 时启用）：`apps/api/test/mvp-flow.e2e-spec.ts:1`
