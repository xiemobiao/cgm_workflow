/**
 * Event Flow Templates and Known Events
 *
 * Defines the standard event flow templates and all known BLE events
 * for event flow coverage analysis.
 */

// ========== Type Definitions ==========

export type EventFlowStage = {
  id: string;
  name: string;
  required: boolean;
  maxDurationMs?: number | null;
  events: EventFlowEvent[];
};

export type EventFlowEvent = {
  eventName: string;
  required: boolean;
  description?: string;
};

export type EventFlowTemplate = {
  id: string;
  name: string;
  description: string;
  stages: EventFlowStage[];
};

export type KnownEventCategory = {
  category: string;
  events: KnownEvent[];
};

export type KnownEvent = {
  eventName: string;
  level: 'INFO' | 'DEBUG' | 'ERROR' | 'WARN';
  description: string;
};

/**
 * Version tag for event-flow template snapshots persisted to database.
 * Bump this when main-flow stages/events or known-event categories change.
 */
export const EVENT_FLOW_TEMPLATE_VERSION = 20260213;

// ========== Main Flow Template ==========

/**
 * Main Flow Template: BLE flow from SDK init to Real-time Data
 *
 * Defines the standard event flow from SDK initialization to receiving the first
 * real-time data from the CGM device, with optional historical data steps.
 */
export const MAIN_FLOW_TEMPLATE: EventFlowTemplate = {
  id: 'main_flow',
  name: '主链路分析',
  description: '从 SDK 初始化到接收实时数据的完整链路（含历史数据流程）',
  stages: [
    {
      id: 'sdk_init',
      name: 'SDK 初始化',
      required: true,
      maxDurationMs: 3000,
      events: [
        {
          eventName: 'SDK init start',
          required: true,
          description: 'SDK 初始化开始',
        },
        {
          eventName: 'SDK init success',
          required: true,
          description: 'SDK 初始化成功',
        },
        {
          eventName: 'SDK init failure',
          required: false,
          description: 'SDK 初始化失败',
        },
      ],
    },
    {
      id: 'ble_scan',
      name: '蓝牙扫描',
      required: true,
      maxDurationMs: 30000,
      events: [
        {
          eventName: 'BLE start searching',
          required: true,
          description: '开始扫描蓝牙设备',
        },
        {
          eventName: 'BLE search success',
          required: true,
          description: '扫描到目标设备',
        },
        {
          eventName: 'BLE search failure',
          required: false,
          description: '扫描失败',
        },
      ],
    },
    {
      id: 'ble_connect',
      name: '蓝牙连接',
      required: true,
      maxDurationMs: 15000,
      events: [
        {
          eventName: 'BLE start connection',
          required: true,
          description: '开始连接设备',
        },
        {
          eventName: 'BLE connection success',
          required: true,
          description: '连接成功',
        },
        {
          eventName: 'BLE connection failure',
          required: false,
          description: '连接失败',
        },
      ],
    },
    {
      id: 'ble_auth',
      name: '设备鉴权',
      required: true,
      maxDurationMs: 10000,
      events: [
        {
          eventName: 'BLE auth sendKey',
          required: false,
          description: '发送鉴权密钥',
        },
        {
          eventName: 'BLE auth success',
          required: true,
          description: '鉴权成功',
        },
        {
          eventName: 'BLE auth failure',
          required: false,
          description: '鉴权失败',
        },
      ],
    },
    {
      id: 'history_data_query',
      name: '获取历史数据',
      required: false,
      maxDurationMs: 120000,
      events: [
        {
          eventName: 'BLE start getData',
          required: false,
          description: '蓝牙数据传输-请求开始',
        },
        {
          eventName: 'BLE start getData error',
          required: false,
          description: '蓝牙数据传输-请求失败',
        },
      ],
    },
    {
      id: 'history_data_callback',
      name: '历史数据接收',
      required: false,
      maxDurationMs: 120000,
      events: [
        {
          eventName: 'BLE data receive start',
          required: false,
          description: '蓝牙数据传输-回传开始',
        },
        {
          eventName: 'BLE data receive done',
          required: false,
          description: '蓝牙数据传输-回传成功',
        },
      ],
    },
    {
      id: 'realtime_data',
      name: '实时数据回调',
      required: true,
      maxDurationMs: 60000,
      events: [
        {
          eventName: 'BLE real time data callback start',
          required: true,
          description: '开始接收实时数据',
        },
        {
          eventName: 'BLE real time data callback done',
          required: true,
          description: '实时数据接收完成',
        },
      ],
    },
  ],
};

// ========== Known Events (54 events across 15 categories) ==========

/**
 * All known BLE events categorized by functionality
 *
 * Based on: /蓝牙SDK日志事件列表.md
 * Total: 54 events across 15 categories
 */
export const BLE_KNOWN_EVENTS: KnownEventCategory[] = [
  {
    category: 'SDK初始化',
    events: [
      {
        eventName: 'SDK init start',
        level: 'INFO',
        description: 'SDK初始化开始',
      },
      {
        eventName: 'SDK init success',
        level: 'INFO',
        description: 'SDK初始化成功',
      },
      {
        eventName: 'SDK init failure',
        level: 'ERROR',
        description: 'SDK初始化失败',
      },
    ],
  },
  {
    category: '蓝牙库信息',
    events: [
      {
        eventName: 'BLE library version',
        level: 'INFO',
        description: '蓝牙库版本信息',
      },
    ],
  },
  {
    category: '蓝牙扫描',
    events: [
      {
        eventName: 'BLE start searching',
        level: 'INFO',
        description: '开始扫描设备',
      },
      {
        eventName: 'BLE search success',
        level: 'INFO',
        description: '扫描成功',
      },
      {
        eventName: 'BLE search failure',
        level: 'ERROR',
        description: '扫描失败',
      },
    ],
  },
  {
    category: '蓝牙鉴权及ID校验',
    events: [
      {
        eventName: 'BLE auth sendKey',
        level: 'INFO',
        description: '发送鉴权密钥',
      },
      { eventName: 'BLE auth success', level: 'INFO', description: '鉴权成功' },
      {
        eventName: 'BLE auth failure',
        level: 'ERROR',
        description: '鉴权失败',
      },
    ],
  },
  {
    category: '蓝牙设备状态查询',
    events: [
      {
        eventName: 'BLE query device status',
        level: 'INFO',
        description: '查询设备状态',
      },
      {
        eventName: 'BLE query device status success',
        level: 'INFO',
        description: '查询设备状态成功',
      },
      {
        eventName: 'BLE query device status failure',
        level: 'ERROR',
        description: '查询设备状态失败',
      },
    ],
  },
  {
    category: '蓝牙设备SN码查询',
    events: [
      { eventName: 'BLE query sn', level: 'INFO', description: '查询设备SN码' },
      {
        eventName: 'BLE query sn success',
        level: 'INFO',
        description: '查询SN码成功',
      },
      {
        eventName: 'BLE query sn failure',
        level: 'ERROR',
        description: '查询SN码失败',
      },
    ],
  },
  {
    category: '蓝牙设备灵敏度查询',
    events: [
      {
        eventName: 'BLE query sensitivity',
        level: 'INFO',
        description: '查询设备灵敏度',
      },
      {
        eventName: 'BLE query sensitivity success',
        level: 'INFO',
        description: '查询灵敏度成功',
      },
      {
        eventName: 'BLE query sensitivity failure',
        level: 'ERROR',
        description: '查询灵敏度失败',
      },
    ],
  },
  {
    category: '蓝牙设备激活时间查询',
    events: [
      {
        eventName: 'BLE query activate time',
        level: 'INFO',
        description: '查询设备激活时间',
      },
      {
        eventName: 'BLE query activate time success',
        level: 'INFO',
        description: '查询激活时间成功',
      },
      {
        eventName: 'BLE query activate time failure',
        level: 'ERROR',
        description: '查询激活时间失败',
      },
    ],
  },
  {
    category: '蓝牙设备初始化时长查询',
    events: [
      {
        eventName: 'BLE query init duration',
        level: 'INFO',
        description: '查询设备初始化时长',
      },
      {
        eventName: 'BLE query init duration success',
        level: 'INFO',
        description: '查询初始化时长成功',
      },
      {
        eventName: 'BLE query init duration failure',
        level: 'ERROR',
        description: '查询初始化时长失败',
      },
    ],
  },
  {
    category: '蓝牙激活及ID绑定',
    events: [
      { eventName: 'BLE activate', level: 'INFO', description: '激活设备' },
      {
        eventName: 'BLE activate success',
        level: 'INFO',
        description: '激活成功',
      },
      {
        eventName: 'BLE activate failure',
        level: 'ERROR',
        description: '激活失败',
      },
    ],
  },
  {
    category: '蓝牙设备停用',
    events: [
      { eventName: 'BLE deactivate', level: 'INFO', description: '停用设备' },
      {
        eventName: 'BLE deactivate success',
        level: 'INFO',
        description: '停用成功',
      },
      {
        eventName: 'BLE deactivate failure',
        level: 'ERROR',
        description: '停用失败',
      },
    ],
  },
  {
    category: '蓝牙连接',
    events: [
      {
        eventName: 'BLE start connection',
        level: 'INFO',
        description: '开始连接',
      },
      {
        eventName: 'BLE connection success',
        level: 'INFO',
        description: '连接成功',
      },
      {
        eventName: 'BLE connection failure',
        level: 'ERROR',
        description: '连接失败',
      },
      { eventName: 'BLE disconnect', level: 'INFO', description: '断开连接' },
    ],
  },
  {
    category: '获取历史数据',
    events: [
      {
        eventName: 'BLE start getData',
        level: 'INFO',
        description: '蓝牙数据传输-请求开始',
      },
      {
        eventName: 'BLE start getData error',
        level: 'INFO',
        description: '蓝牙数据传输-请求失败',
      },
    ],
  },
  {
    category: '历史数据接收',
    events: [
      {
        eventName: 'BLE data receive start',
        level: 'DEBUG',
        description: '蓝牙数据传输-回传开始',
      },
      {
        eventName: 'BLE data receive done',
        level: 'DEBUG',
        description: '蓝牙数据传输-回传成功',
      },
    ],
  },
  {
    category: '实时数据回调',
    events: [
      {
        eventName: 'BLE real time data callback start',
        level: 'DEBUG',
        description: '实时数据回调开始',
      },
      {
        eventName: 'BLE real time data callback done',
        level: 'DEBUG',
        description: '实时数据回调完成',
      },
    ],
  },
  {
    category: '最新一笔有效数据回调',
    events: [
      {
        eventName: 'BLE latest valid data callback start',
        level: 'DEBUG',
        description: '最新有效数据回调开始',
      },
      {
        eventName: 'BLE latest valid data callback done',
        level: 'DEBUG',
        description: '最新有效数据回调完成',
      },
    ],
  },
  {
    category: '蓝牙状态',
    events: [
      { eventName: 'BLE state', level: 'INFO', description: '蓝牙状态变化' },
    ],
  },
  {
    category: 'APP 状态',
    events: [
      {
        eventName: 'APP starts to launch',
        level: 'INFO',
        description: 'APP开始启动',
      },
      {
        eventName: 'APP startup completed',
        level: 'INFO',
        description: 'APP启动完成',
      },
      {
        eventName: 'APP enter foreground',
        level: 'INFO',
        description: 'APP进入前台',
      },
      {
        eventName: 'APP enter background',
        level: 'INFO',
        description: 'APP进入后台',
      },
    ],
  },
  {
    category: '蓝牙开关',
    events: [
      { eventName: 'BLE turn on', level: 'INFO', description: '蓝牙打开' },
      { eventName: 'BLE turn off', level: 'WARN', description: '蓝牙关闭' },
    ],
  },
  {
    category: '通用/错误',
    events: [
      { eventName: 'BLE exception', level: 'ERROR', description: '蓝牙异常' },
      {
        eventName: 'BLE command timeout',
        level: 'ERROR',
        description: '命令超时',
      },
      { eventName: 'BLE retry', level: 'WARN', description: '重试' },
      {
        eventName: 'BLE permission denied',
        level: 'ERROR',
        description: '权限拒绝',
      },
      {
        eventName: 'HTTP request start',
        level: 'DEBUG',
        description: 'HTTP请求开始',
      },
      {
        eventName: 'HTTP request success',
        level: 'DEBUG',
        description: 'HTTP请求成功',
      },
      {
        eventName: 'HTTP request failure',
        level: 'ERROR',
        description: 'HTTP请求失败',
      },
      {
        eventName: 'MQTT connected',
        level: 'INFO',
        description: 'MQTT连接成功',
      },
    ],
  },
];

// ========== Helper Functions ==========

/**
 * Get all event names from the main flow template
 */
export function getMainFlowEventNames(): string[] {
  const names: string[] = [];
  for (const stage of MAIN_FLOW_TEMPLATE.stages) {
    for (const event of stage.events) {
      names.push(event.eventName);
    }
  }
  return names;
}

/**
 * Get all known event names (flattened)
 */
export function getAllKnownEventNames(): string[] {
  const names: string[] = [];
  for (const category of BLE_KNOWN_EVENTS) {
    for (const event of category.events) {
      names.push(event.eventName);
    }
  }
  return names;
}

/**
 * Get event category by event name
 */
export function getEventCategory(eventName: string): string | null {
  for (const category of BLE_KNOWN_EVENTS) {
    for (const event of category.events) {
      if (event.eventName === eventName) {
        return category.category;
      }
    }
  }
  return null;
}

/**
 * Check if an event is part of the main flow
 */
export function isMainFlowEvent(eventName: string): boolean {
  return getMainFlowEventNames().includes(eventName);
}

/**
 * Check if an event is a known event
 */
export function isKnownEvent(eventName: string): boolean {
  return getAllKnownEventNames().includes(eventName);
}
