export type BleRequiredEvent = {
  category: string;
  description: string;
  eventName: string;
  expectedLevel: 1 | 2 | 3 | 4;
};

export const BLE_REQUIRED_EVENTS: BleRequiredEvent[] = [
  // SDK 初始化
  {
    category: 'SDK 初始化',
    description: 'SDK初始化开始',
    eventName: 'SDK init start',
    expectedLevel: 2,
  },
  {
    category: 'SDK 初始化',
    description: 'SDK初始化失败',
    eventName: 'SDK init failure',
    expectedLevel: 4,
  },
  {
    category: 'SDK 初始化',
    description: 'SDK初始化成功',
    eventName: 'SDK init success',
    expectedLevel: 2,
  },

  // 蓝牙库信息
  {
    category: '蓝牙库信息',
    description: '蓝牙库信息（设备连接成功时）',
    eventName: 'BLE sdk info',
    expectedLevel: 1,
  },

  // 蓝牙扫描
  {
    category: '蓝牙扫描',
    description: '蓝牙扫描-开始',
    eventName: 'BLE start searching',
    expectedLevel: 2,
  },
  {
    category: '蓝牙扫描',
    description: '蓝牙扫描-失败',
    eventName: 'BLE search failure',
    expectedLevel: 4,
  },
  {
    category: '蓝牙扫描',
    description: '蓝牙扫描-成功',
    eventName: 'BLE search success',
    expectedLevel: 2,
  },

  // 蓝牙鉴权及ID校验
  {
    category: '蓝牙鉴权及ID校验',
    description: '蓝牙鉴权及ID校验-发送密钥',
    eventName: 'BLE auth sendKey',
    expectedLevel: 1,
  },
  {
    category: '蓝牙鉴权及ID校验',
    description: '蓝牙鉴权及ID校验-鉴权成功',
    eventName: 'BLE auth success',
    expectedLevel: 2,
  },
  {
    category: '蓝牙鉴权及ID校验',
    description: '蓝牙鉴权及ID校验-鉴权失败',
    eventName: 'BLE auth failure',
    expectedLevel: 4,
  },

  // 蓝牙设备状态查询
  {
    category: '蓝牙设备状态查询',
    description: '蓝牙设备状态查询开始',
    eventName: 'BLE query device status',
    expectedLevel: 1,
  },
  {
    category: '蓝牙设备状态查询',
    description: '蓝牙设备状态查询成功',
    eventName: 'BLE query device status success',
    expectedLevel: 2,
  },
  {
    category: '蓝牙设备状态查询',
    description: '蓝牙设备状态查询失败',
    eventName: 'BLE query device status failure',
    expectedLevel: 4,
  },

  // 蓝牙设备SN码查询
  {
    category: '蓝牙设备SN码查询',
    description: '蓝牙设备sn码查询开始',
    eventName: 'BLE query sn',
    expectedLevel: 1,
  },
  {
    category: '蓝牙设备SN码查询',
    description: '蓝牙设备sn码查询成功',
    eventName: 'BLE query sn success',
    expectedLevel: 2,
  },
  {
    category: '蓝牙设备SN码查询',
    description: '蓝牙设备sn码查询失败',
    eventName: 'BLE query sn failure',
    expectedLevel: 4,
  },

  // 蓝牙设备灵敏度查询
  {
    category: '蓝牙设备灵敏度查询',
    description: '蓝牙设备灵敏度查询开始',
    eventName: 'BLE query sensitivity',
    expectedLevel: 1,
  },
  {
    category: '蓝牙设备灵敏度查询',
    description: '蓝牙设备灵敏度查询成功',
    eventName: 'BLE query sensitivity success',
    expectedLevel: 2,
  },
  {
    category: '蓝牙设备灵敏度查询',
    description: '蓝牙设备灵敏度查询失败',
    eventName: 'BLE query sensitivity failure',
    expectedLevel: 4,
  },

  // 蓝牙设备激活时间查询
  {
    category: '蓝牙设备激活时间查询',
    description: '蓝牙设备激活时间查询开始',
    eventName: 'BLE query active time',
    expectedLevel: 1,
  },
  {
    category: '蓝牙设备激活时间查询',
    description: '蓝牙设备激活时间查询成功',
    eventName: 'BLE query active time success',
    expectedLevel: 2,
  },
  {
    category: '蓝牙设备激活时间查询',
    description: '蓝牙设备激活时间查询失败',
    eventName: 'BLE query active time failure',
    expectedLevel: 4,
  },

  // 蓝牙设备初始化时长查询
  {
    category: '蓝牙设备初始化时长查询',
    description: '蓝牙设备初始化时长查询开始',
    eventName: 'BLE query init time',
    expectedLevel: 1,
  },
  {
    category: '蓝牙设备初始化时长查询',
    description: '蓝牙设备初始化时长查询成功',
    eventName: 'BLE query init time success',
    expectedLevel: 2,
  },
  {
    category: '蓝牙设备初始化时长查询',
    description: '蓝牙设备初始化时长查询失败',
    eventName: 'BLE query init time failure',
    expectedLevel: 4,
  },

  // 蓝牙激活及ID绑定
  {
    category: '蓝牙激活及ID绑定',
    description: '蓝牙激活及ID绑定-发送激活数据',
    eventName: 'BLE activation sendData',
    expectedLevel: 2,
  },
  {
    category: '蓝牙激活及ID绑定',
    description: '蓝牙激活及ID绑定-激活成功',
    eventName: 'BLE activation success',
    expectedLevel: 2,
  },
  {
    category: '蓝牙激活及ID绑定',
    description: '蓝牙激活及ID绑定-激活失败',
    eventName: 'BLE activation failure',
    expectedLevel: 4,
  },

  // 蓝牙设备停用
  {
    category: '蓝牙设备停用',
    description: '蓝牙设备停用开始',
    eventName: 'BLE deactivation start',
    expectedLevel: 1,
  },
  {
    category: '蓝牙设备停用',
    description: '蓝牙设备停用成功',
    eventName: 'BLE deactivation success',
    expectedLevel: 2,
  },
  {
    category: '蓝牙设备停用',
    description: '蓝牙设备停用失败',
    eventName: 'BLE deactivation failure',
    expectedLevel: 4,
  },

  // 蓝牙连接
  {
    category: '蓝牙连接',
    description: '蓝牙连接-开始',
    eventName: 'BLE start connection',
    expectedLevel: 2,
  },
  {
    category: '蓝牙连接',
    description: '蓝牙连接-失败',
    eventName: 'BLE connection failure',
    expectedLevel: 4,
  },
  {
    category: '蓝牙连接',
    description: '蓝牙连接-成功',
    eventName: 'BLE connection success',
    expectedLevel: 2,
  },
  {
    category: '蓝牙连接',
    description: '蓝牙连接-断开',
    eventName: 'BLE disconnect',
    expectedLevel: 3,
  },

  // 历史数据查询
  {
    category: '历史数据查询',
    description: '历史数据查询-请求开始',
    eventName: 'BLE start getData',
    expectedLevel: 1,
  },
  {
    category: '历史数据查询',
    description: '历史数据查询-请求失败',
    eventName: 'BLE start getData error',
    expectedLevel: 4,
  },

  // 历史数据回调
  {
    category: '历史数据回调',
    description: '历史数据回调-回传失败',
    eventName: 'BLE data receive error',
    expectedLevel: 4,
  },
  {
    category: '历史数据回调',
    description: '历史数据回调-回传开始',
    eventName: 'BLE data receive start',
    expectedLevel: 1,
  },
  {
    category: '历史数据回调',
    description: '历史数据回调-回传成功',
    eventName: 'BLE data receive done',
    expectedLevel: 2,
  },

  // 实时数据回调
  {
    category: '实时数据回调',
    description: '实时数据回调-开始',
    eventName: 'BLE real time data callback start',
    expectedLevel: 2,
  },
  {
    category: '实时数据回调',
    description: '实时数据回调-完成',
    eventName: 'BLE real time data callback done',
    expectedLevel: 2,
  },

  // 最新一笔有效数据回调
  {
    category: '最新一笔有效数据回调',
    description: '最新一笔有效数据回调-开始',
    eventName: 'BLE latest valid data callback Start',
    expectedLevel: 2,
  },
  {
    category: '最新一笔有效数据回调',
    description: '最新一笔有效数据回调-结束',
    eventName: 'BLE latest valid data callback done',
    expectedLevel: 2,
  },

  // 蓝牙状态
  {
    category: '蓝牙状态',
    description: '当前蓝牙状态',
    eventName: 'BLE current Status Value',
    expectedLevel: 1,
  },

  // APP 状态
  {
    category: 'APP 状态',
    description: 'app前台',
    eventName: 'APP foreground',
    expectedLevel: 2,
  },
  {
    category: 'APP 状态',
    description: 'app后台',
    eventName: 'APP background',
    expectedLevel: 2,
  },
  {
    category: 'APP 状态',
    description: 'APP开始启动',
    eventName: 'APP starts to launch',
    expectedLevel: 2,
  },
  {
    category: 'APP 状态',
    description: 'APP启动完成',
    eventName: 'APP startup completed',
    expectedLevel: 2,
  },

  // 蓝牙开关
  {
    category: '蓝牙开关',
    description: '蓝牙开关开启',
    eventName: 'Bluetooth switch is on',
    expectedLevel: 2,
  },
  {
    category: '蓝牙开关',
    description: '蓝牙开关关闭',
    eventName: 'Bluetooth switch is off',
    expectedLevel: 2,
  },

  // 通用/错误
  { category: '通用/错误', description: '通用', eventName: 'COMMON', expectedLevel: 2 },
  {
    category: '通用/错误',
    description: '通用错误',
    eventName: 'GENERIC Error',
    expectedLevel: 4,
  },
  {
    category: '通用/错误',
    description: '网络错误',
    eventName: 'Network error',
    expectedLevel: 4,
  },
  {
    category: '通用/错误',
    description: 'SDK权限错误',
    eventName: 'SDK auth error',
    expectedLevel: 4,
  },
  {
    category: '通用/错误',
    description: '蓝牙相关错误',
    eventName: 'BLE error',
    expectedLevel: 4,
  },
  {
    category: '通用/错误',
    description: '设备相关错误',
    eventName: 'Device error',
    expectedLevel: 4,
  },
  {
    category: '通用/错误',
    description: '数据错误',
    eventName: 'Data error',
    expectedLevel: 4,
  },
];

export type BleFlowPairCheck = {
  name: string;
  startEventName: string;
  endEventNames: string[];
};

export const BLE_FLOW_PAIR_CHECKS: BleFlowPairCheck[] = [
  {
    name: 'SDK 初始化',
    startEventName: 'SDK init start',
    endEventNames: ['SDK init success', 'SDK init failure'],
  },
  {
    name: '蓝牙扫描',
    startEventName: 'BLE start searching',
    endEventNames: ['BLE search success', 'BLE search failure'],
  },
  {
    name: '蓝牙鉴权及ID校验',
    startEventName: 'BLE auth sendKey',
    endEventNames: ['BLE auth success', 'BLE auth failure'],
  },
  {
    name: '蓝牙设备状态查询',
    startEventName: 'BLE query device status',
    endEventNames: [
      'BLE query device status success',
      'BLE query device status failure',
    ],
  },
  {
    name: '蓝牙设备SN码查询',
    startEventName: 'BLE query sn',
    endEventNames: ['BLE query sn success', 'BLE query sn failure'],
  },
  {
    name: '蓝牙设备灵敏度查询',
    startEventName: 'BLE query sensitivity',
    endEventNames: ['BLE query sensitivity success', 'BLE query sensitivity failure'],
  },
  {
    name: '蓝牙设备激活时间查询',
    startEventName: 'BLE query active time',
    endEventNames: ['BLE query active time success', 'BLE query active time failure'],
  },
  {
    name: '蓝牙设备初始化时长查询',
    startEventName: 'BLE query init time',
    endEventNames: ['BLE query init time success', 'BLE query init time failure'],
  },
  {
    name: '蓝牙激活及ID绑定',
    startEventName: 'BLE activation sendData',
    endEventNames: ['BLE activation success', 'BLE activation failure'],
  },
  {
    name: '蓝牙设备停用',
    startEventName: 'BLE deactivation start',
    endEventNames: ['BLE deactivation success', 'BLE deactivation failure'],
  },
  {
    name: '蓝牙连接',
    startEventName: 'BLE start connection',
    endEventNames: ['BLE connection success', 'BLE connection failure'],
  },
  {
    name: '历史数据回调',
    startEventName: 'BLE data receive start',
    endEventNames: ['BLE data receive done', 'BLE data receive error'],
  },
  {
    name: '实时数据回调',
    startEventName: 'BLE real time data callback start',
    endEventNames: ['BLE real time data callback done'],
  },
  {
    name: '最新一笔有效数据回调',
    startEventName: 'BLE latest valid data callback Start',
    endEventNames: ['BLE latest valid data callback done'],
  },
];

