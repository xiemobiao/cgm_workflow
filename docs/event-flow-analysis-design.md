# 事件流覆盖率分析功能设计

## 功能目标

统计 showcase app 从启动到接收实时数据的完整事件链路,分析哪些事件被触发、哪些缺失、每个阶段耗时情况。

## 核心概念

### 事件流模板 (Event Flow Template)

定义一个标准的事件序列,表示正常情况下应该出现的事件链路:

```typescript
type EventFlowTemplate = {
  id: string;
  name: string;
  description: string;
  stages: EventFlowStage[];
};

type EventFlowStage = {
  id: string;
  name: string;
  required: boolean; // 是否必须出现
  events: EventFlowEvent[];
  maxDurationMs?: number; // 期望的最大耗时
};

type EventFlowEvent = {
  eventName: string;
  required: boolean;
  description: string;
};
```

### 标准事件流: "启动到实时数据"

```json
{
  "id": "startup_to_realtime",
  "name": "启动到实时数据流程",
  "description": "从 APP 启动到接收第一笔实时数据的完整链路",
  "stages": [
    {
      "id": "app_init",
      "name": "APP 初始化",
      "required": true,
      "maxDurationMs": 5000,
      "events": [
        { "eventName": "APP starts to launch", "required": true },
        { "eventName": "SDK init start", "required": true },
        { "eventName": "SDK init success", "required": true },
        { "eventName": "APP startup completed", "required": true }
      ]
    },
    {
      "id": "ble_scanning",
      "name": "蓝牙扫描",
      "required": true,
      "maxDurationMs": 30000,
      "events": [
        { "eventName": "BLE start searching", "required": true },
        { "eventName": "BLE search success", "required": true }
      ]
    },
    {
      "id": "ble_connection",
      "name": "蓝牙连接",
      "required": true,
      "maxDurationMs": 15000,
      "events": [
        { "eventName": "BLE start connection", "required": true },
        { "eventName": "BLE connection success", "required": true }
      ]
    },
    {
      "id": "ble_auth",
      "name": "设备鉴权",
      "required": true,
      "maxDurationMs": 10000,
      "events": [
        { "eventName": "BLE auth sendKey", "required": false },
        { "eventName": "BLE auth success", "required": true }
      ]
    },
    {
      "id": "device_query",
      "name": "设备信息查询",
      "required": false,
      "maxDurationMs": 5000,
      "events": [
        { "eventName": "BLE query device status", "required": false },
        { "eventName": "BLE query sn", "required": false },
        { "eventName": "BLE query sensitivity", "required": false }
      ]
    },
    {
      "id": "realtime_data",
      "name": "实时数据接收",
      "required": true,
      "maxDurationMs": null,
      "events": [
        { "eventName": "BLE real time data callback start", "required": true },
        { "eventName": "BLE real time data callback done", "required": true }
      ]
    }
  ]
}
```

## 数据模型

### Prisma Schema 扩展

```prisma
// 事件流模板定义
model EventFlowTemplate {
  id          String   @id @default(uuid()) @db.Uuid
  projectId   String   @db.Uuid
  name        String
  description String?
  template    Json     // 存储完整的模板定义
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  project     Project  @relation(fields: [projectId], references: [id])
  analyses    EventFlowAnalysis[]

  @@index([projectId, isActive])
}

// 事件流分析结果
model EventFlowAnalysis {
  id              String   @id @default(uuid()) @db.Uuid
  logFileId       String   @db.Uuid
  projectId       String   @db.Uuid
  templateId      String   @db.Uuid

  // 分析结果
  coveragePercent Int      // 0-100 事件覆盖率
  totalDurationMs BigInt?  // 总耗时
  sessionCount    Int      // 分析的会话数

  // 详细结果 JSON
  stageResults    Json     // 每个阶段的详细结果
  missedEvents    Json     // 缺失的事件列表
  extraEvents     Json     // 额外出现的未定义事件
  timingIssues    Json     // 超时或异常耗时的阶段

  // 示例会话
  sampleLinkCodes String[] // 示例 linkCode 列表

  createdAt       DateTime @default(now())

  logFile         LogFile  @relation(fields: [logFileId], references: [id], onDelete: Cascade)
  project         Project  @relation(fields: [projectId], references: [id])
  template        EventFlowTemplate @relation(fields: [templateId], references: [id])

  @@unique([logFileId, templateId])
  @@index([projectId, createdAt])
  @@index([coveragePercent])
}
```

### 分析结果 JSON 结构

```typescript
type EventFlowAnalysisResult = {
  templateId: string;
  templateName: string;
  coveragePercent: number;
  totalDurationMs: number | null;
  sessionCount: number;

  stageResults: StageResult[];
  missedEvents: MissedEvent[];
  extraEvents: ExtraEvent[];
  timingIssues: TimingIssue[];
  sampleSessions: SessionAnalysis[];
};

type StageResult = {
  stageId: string;
  stageName: string;
  coverage: number; // 0-100
  avgDurationMs: number | null;
  maxDurationMs: number | null;
  minDurationMs: number | null;
  sessionCount: number; // 有多少个会话完成了这个阶段
  eventCoverage: EventCoverage[];
};

type EventCoverage = {
  eventName: string;
  required: boolean;
  hitCount: number; // 出现次数
  hitRate: number; // 在所有会话中的出现比例 0-1
};

type MissedEvent = {
  eventName: string;
  stageId: string;
  required: boolean;
  missedInSessions: string[]; // 哪些 linkCode 缺失了这个事件
};

type ExtraEvent = {
  eventName: string;
  count: number;
  sampleLinkCodes: string[];
};

type TimingIssue = {
  stageId: string;
  stageName: string;
  expectedMaxMs: number;
  actualMaxMs: number;
  sessionLinkCode: string;
};

type SessionAnalysis = {
  linkCode: string;
  coveragePercent: number;
  totalDurationMs: number;
  stageTimings: StageTimin[];
  missedEvents: string[];
};

type StageTiming = {
  stageId: string;
  startTime: number; // timestamp ms
  endTime: number;
  durationMs: number;
  completed: boolean;
};
```

## API 设计

### 1. 获取事件流模板列表

```
GET /api/event-flow-templates?projectId=xxx
```

Response:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "xxx",
        "name": "启动到实时数据流程",
        "description": "...",
        "isActive": true
      }
    ]
  }
}
```

### 2. 分析日志文件的事件流

```
POST /api/logs/files/:id/analyze-event-flow

Body:
{
  "templateId": "xxx",  // 可选,不提供则使用默认模板
  "linkCode": "xxx"     // 可选,只分析特定会话
}
```

Response:
```json
{
  "success": true,
  "data": {
    "analysisId": "xxx",
    "coveragePercent": 85,
    "totalDurationMs": 45000,
    "sessionCount": 3,
    "stageResults": [...],
    "missedEvents": [...],
    "timingIssues": [...]
  }
}
```

### 3. 获取事件流分析结果

```
GET /api/logs/files/:id/event-flow-analysis?templateId=xxx
```

## 实现步骤

### Phase 1: 数据模型与模板 (1天)

1. **数据库迁移**
   - 添加 `EventFlowTemplate` 和 `EventFlowAnalysis` 表
   - 创建初始迁移脚本

2. **种子数据**
   - 创建默认的 "启动到实时数据" 模板
   - 插入到 seed 脚本中

### Phase 2: 后端分析服务 (2天)

1. **EventFlowAnalyzerService**
   - 提取日志文件的所有 linkCode 会话
   - 对每个会话按时间排序事件
   - 匹配模板中的事件
   - 计算覆盖率和耗时
   - 识别缺失/额外事件
   - 检测超时问题

2. **API 端点实现**
   - `POST /api/logs/files/:id/analyze-event-flow`
   - `GET /api/logs/files/:id/event-flow-analysis`
   - 集成到 LogsController

### Phase 3: 前端可视化 (2天)

1. **事件流时间线组件**
   - 展示完整的事件流阶段
   - 每个阶段显示:
     - 期望事件 vs 实际事件
     - 覆盖率百分比
     - 平均/最大/最小耗时
   - 高亮缺失的必需事件
   - 标记超时阶段

2. **会话详情视图**
   - 选择一个 linkCode 查看详细事件序列
   - 时间轴可视化
   - 事件详情展开

3. **集成到分析仪表盘**
   - 在 `/logs/files/[id]/analysis` 页面添加 "事件流分析" Tab
   - 显示覆盖率概览
   - 快速跳转到问题会话

### Phase 4: 自动触发与优化 (1天)

1. **自动分析**
   - 修改 `LogsAnalyzerService.analyzeLogFile()`
   - 解析完成后自动运行事件流分析
   - 结果存储到 `EventFlowAnalysis` 表

2. **性能优化**
   - 批量查询事件
   - 使用数据库索引加速 linkCode 查询
   - 缓存模板定义

## 前端 UI 设计

### 事件流分析页面结构

```
┌─────────────────────────────────────────────────────┐
│  事件流分析: 启动到实时数据                           │
├─────────────────────────────────────────────────────┤
│  总体覆盖率: 85%   分析会话: 3   平均耗时: 45s       │
├─────────────────────────────────────────────────────┤
│                                                      │
│  阶段 1: APP 初始化          覆盖率: 100%  ⏱ 2.5s   │
│    ✓ APP starts to launch       (3/3 会话)          │
│    ✓ SDK init start             (3/3 会话)          │
│    ✓ SDK init success           (3/3 会话)          │
│    ✓ APP startup completed      (3/3 会话)          │
│                                                      │
│  阶段 2: 蓝牙扫描            覆盖率: 100%  ⏱ 8.2s   │
│    ✓ BLE start searching        (3/3 会话)          │
│    ✓ BLE search success         (3/3 会话)          │
│                                                      │
│  阶段 3: 蓝牙连接            覆盖率: 100%  ⏱ 12.1s  │
│    ✓ BLE start connection       (3/3 会话)          │
│    ✓ BLE connection success     (3/3 会话)          │
│                                                      │
│  阶段 4: 设备鉴权            覆盖率: 66%   ⏱ 5.3s   │
│    ⚠ BLE auth sendKey           (1/3 会话) [可选]   │
│    ✓ BLE auth success           (3/3 会话)          │
│                                                      │
│  阶段 5: 设备信息查询        覆盖率: 33%   ⏱ 2.1s   │
│    ✗ BLE query device status    (0/3 会话) [可选]   │
│    ✓ BLE query sn               (2/3 会话) [可选]   │
│    ✗ BLE query sensitivity      (0/3 会话) [可选]   │
│                                                      │
│  阶段 6: 实时数据接收        覆盖率: 100%            │
│    ✓ BLE real time data callback start (3/3 会话)   │
│    ✓ BLE real time data callback done  (3/3 会话)   │
│                                                      │
├─────────────────────────────────────────────────────┤
│  ⚠ 发现的问题:                                       │
│    • 2个会话缺失 "BLE query sn" 事件                │
│    • 会话 abc123 在 "蓝牙扫描" 阶段耗时 28s (超时)   │
│                                                      │
│  示例会话:                                           │
│    [查看 linkCode: abc123] [查看 linkCode: def456]  │
└─────────────────────────────────────────────────────┘
```

## 效果评估

### 预期效果

1. **快速定位问题**
   - 一眼看出哪个阶段出问题了
   - 缺失的必需事件立即可见
   - 超时阶段一目了然

2. **效率提升**
   - 从手动搜索事件 (5-10 分钟) → 自动分析 (< 5 秒)
   - 节省 **95%** 的时间

3. **覆盖完整链路**
   - 确保所有关键事件都被记录
   - 发现遗漏的日志打点

## 技术难点与解决方案

### 难点 1: 会话边界识别

**问题**: 如何准确识别一个完整的会话?
- 同一个 linkCode 可能有多次连接尝试
- 断连重连的情况如何处理?

**解决方案**:
1. 以 "APP starts to launch" 或 "BLE start connection" 作为会话开始
2. 以 "BLE disconnect" 或下一个相同类型的开始事件作为会话结束
3. 允许配置会话超时时间 (默认 10 分钟无新事件视为结束)

### 难点 2: 事件顺序不严格

**问题**: 实际日志中事件顺序可能与模板不完全一致
- 某些查询可能并发执行
- 事件时间戳精度问题

**解决方案**:
1. 模板中只定义必须出现的事件,不严格要求顺序
2. 使用时间窗口匹配 (同一阶段内的事件允许乱序)
3. 提供 "严格模式" 和 "宽松模式" 两种匹配策略

### 难点 3: 性能优化

**问题**: 大日志文件可能有数万条事件,分析耗时

**解决方案**:
1. 使用数据库索引: `(logFileId, linkCode, timestampMs)`
2. 批量查询优化,避免 N+1 查询
3. 后台异步分析,前端轮询结果
4. 缓存分析结果,避免重复计算

## 下一步行动

1. ✅ 完成设计文档
2. ⏳ 创建数据库迁移脚本
3. ⏳ 实现 EventFlowAnalyzerService
4. ⏳ 创建 API 端点
5. ⏳ 实现前端可视化组件
6. ⏳ 集成到分析仪表盘
7. ⏳ 编写单元测试
8. ⏳ 用户测试与优化
