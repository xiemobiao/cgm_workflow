# CGM 工作流平台

用于 CGM SDK 与 App 开发的自建工作流系统，覆盖需求同步、流程推进、
日志诊断与交付验收等关键环节。

## 项目目标
- 建立从需求到交付、线上诊断的统一闭环
- 在自建环境中保留与现有工具的集成能力
- 用日志驱动问题定位与复盘

## 核心能力（MVP）
- 需求同步与状态标准化（保留 source_status）
- 工作流实例、阶段流转与闸门审批
- 解码后 JSONL 日志上传与检索
- 事故管理与日志/需求关联
- 权限与审计记录

## 工作流阶段（MVP）
- Requirement
- Design
- Development
- Test
- Release
- Diagnosis

## 环境要求（建议）
- Node.js：使用团队指定的 LTS 版本
- npm
- PostgreSQL、Redis、MinIO（S3 兼容）
- 具体版本与部署参数见 `docs/mvp/16_local_dev_deploy.md`

## 部署与发布
- 本地开发/部署步骤见 `docs/mvp/16_local_dev_deploy.md`
- CI/CD 与发布流程规划见 `docs/v1/05_cicd_release.md`
- 生产环境密钥、存储与数据库配置按环境补充

## 版本规范（建议）
- 使用语义化版本号（SemVer）
- 里程碑验收通过后打 `vX.Y.Z` tag
- 重大变更同步更新 `docs/mvp` 与 `docs/v1`

## 目录结构
- `apps/api`: NestJS API 服务
- `apps/web`: Next.js Web 前端
- `docs/mvp`: MVP 规格文档
- `docs/v1`: MVP 之后的规划文档
- `docs/logging`: 日志格式规范

## 快速开始

### 0) 启动依赖（Postgres/Redis/MinIO）
```
docker compose up -d
```

### 0.5) 配置环境变量
```
cp .env.example .env
```
说明：
- Web 侧会读取 `NEXT_PUBLIC_API_BASE_URL`（默认 `http://localhost:3001`），用于浏览器直连 API
- API 同时支持 `/api/*` 与 `/api/v1/*`（推荐逐步迁移到 `/api/v1`）

### 1) 安装依赖
```
npm install --prefix apps/api
npm install --prefix apps/web
```

### 1.5) 生成/迁移数据库（首次运行）
```
npm run db:generate
npm run db:migrate:dev
```

### 1.6) 初始化基础数据（roles/admin）
```
npm run db:seed
```
默认管理员账号（可通过 seed env 覆盖）：
- Email：`admin@local.dev`
- Password：`admin123456`

### 2) 本地运行
```
npm run api:dev
npm run web:dev
```

### 健康检查
- API：`http://localhost:3001/health`（业务接口默认前缀为 `/api`）
- Web：`http://localhost:3000/health`

### 3) 根目录脚本
```
api:dev     启动 NestJS 开发服务
api:build   构建 API
api:start   启动 API（生产）
web:dev     启动 Next 开发服务
web:build   构建 Web
web:start   启动 Web（生产）
```

## 文档索引
- `docs/mvp/README_INDEX.md`
- `docs/v1/README.md`
- `docs/logging/cgm_log_format_spec.md`

## 贡献与协作
- 需求/流程变更先更新 `docs/mvp`
- 日志格式以 `docs/logging/cgm_log_format_spec.md` 为准
- 里程碑验收记录见 `docs/mvp/27_milestone_acceptance_mvp.md`
