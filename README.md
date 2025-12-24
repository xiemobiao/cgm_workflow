# CGM SDK Debug Platform

用于 CGM SDK 开发调试的诊断平台，聚焦于日志分析、问题诊断与事故追踪。

## 项目目标
- 提供强大的日志上传、解析与搜索能力
- 蓝牙设备会话追踪与异常检测
- 已知问题库快速诊断匹配
- 事故管理与日志关联分析
- 一键生成分析报告

## 核心功能
- **日志系统**: JSONL 日志上传、解析、多维搜索
- **追踪分析**: 按 requestId/linkCode/deviceMac 追踪命令链路
- **蓝牙调试**: 设备会话时间线、连接状态分析
- **异常检测**: 自动识别频繁断连、超时重试等模式
- **问题库**: 已知问题管理与智能诊断匹配
- **事故管理**: 事故记录与日志事件关联
- **分析报告**: 会话分析、错误分布等报告生成

## 技术栈
- **后端**: NestJS + TypeScript + Prisma + PostgreSQL
- **前端**: Next.js + React + Tailwind CSS + Framer Motion
- **存储**: MinIO (S3 兼容) / 本地文件系统
- **缓存**: Redis

## 环境要求
- Node.js >= 20 LTS
- PostgreSQL 14+
- Redis 6+
- MinIO (可选，本地开发可用文件系统)

## 快速开始

### 1) 启动依赖服务
```bash
docker compose up -d
```

### 2) 配置环境变量
```bash
cp .env.example .env
```

### 3) 安装依赖
```bash
npm install --prefix apps/api
npm install --prefix apps/web
```

### 4) 初始化数据库
```bash
npm run db:generate
npm run db:migrate:dev
npm run db:seed
```

默认管理员账号：
- Email: `admin@local.dev`
- Password: `admin123456`

### 5) 启动开发服务
```bash
npm run api:dev   # API: http://localhost:3001
npm run web:dev   # Web: http://localhost:3000
```

### 健康检查
- API: `http://localhost:3001/health`
- Web: `http://localhost:3000/health`

## 目录结构
```
apps/
  api/          # NestJS API 服务
    src/
      auth/       # 认证模块
      projects/   # 项目管理
      logs/       # 日志系统 (核心)
      incidents/  # 事故管理
      known-issues/ # 问题库
    prisma/       # 数据库模型
  web/          # Next.js 前端
    src/
      app/        # 页面
      components/ # 组件
      lib/        # 工具函数
docs/
  mvp/          # MVP 规格文档
  logging/      # 日志格式规范
```

## 主要页面
- `/` - 仪表盘
- `/logs` - 日志中心
- `/logs/files` - 日志文件管理
- `/logs/trace` - 追踪分析
- `/logs/commands` - 命令链路
- `/logs/bluetooth` - 蓝牙调试
- `/incidents` - 事故管理
- `/known-issues` - 问题库
- `/reports` - 分析报告
- `/settings` - 设置

## 文档
- `docs/logging/cgm_log_format_spec.md` - 日志格式规范
