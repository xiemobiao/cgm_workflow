# i18n 重构计划

## 当前状态
- 所有翻译在单个文件 `apps/web/src/lib/i18n.tsx` (1000+ 行, 48KB)
- 包含 `zh` 和 `en` 两种语言
- 难以维护和团队协作

## 目标结构

```
apps/web/src/lib/i18n/
├── index.tsx           # Provider、hooks、类型定义
├── types.ts            # 类型定义
├── locales/
│   ├── zh/
│   │   ├── index.ts    # 导出合并的对象
│   │   ├── common.ts   # 通用翻译
│   │   ├── nav.ts      # 导航翻译
│   │   ├── table.ts    # 表格翻译
│   │   ├── logs.ts     # 日志模块翻译
│   │   ├── incidents.ts # 事故模块翻译
│   │   ├── settings.ts # 设置模块翻译
│   │   ├── knownIssues.ts # 问题库翻译
│   │   └── reports.ts  # 报告模块翻译
│   └── en/
│       └── ... (同上)
```

## 迁移步骤

1. 创建 `apps/web/src/lib/i18n/` 目录结构
2. 按模块拆分翻译到各自文件
3. 创建 `locales/zh/index.ts` 和 `locales/en/index.ts` 合并导出
4. 更新主 `index.tsx` 导入合并后的翻译
5. 更新所有导入 `@/lib/i18n` 的地方改为 `@/lib/i18n/index`
6. 删除原 `i18n.tsx` 文件

## 模块拆分规则

| 模块 | Key 前缀 |
|------|----------|
| common | `common.` |
| nav | `nav.` |
| table | `table.` |
| project | `project.` |
| dashboard | `dashboard.` |
| login | `login.` |
| logs | `logs.` |
| incidents | `incidents.`, `severity.`, `incidentStatus.` |
| settings | `settings.`, `projects.` |
| knownIssues | `knownIssues.`, `issueCategory.` |
| reports | `reports.`, `reportType.`, `compare.` |
| dialog | `dialog.` |

## 预计工时
- 拆分工作: 2-3 小时
- 测试验证: 1 小时
