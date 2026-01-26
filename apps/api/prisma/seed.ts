import fs from 'node:fs';
import path from 'node:path';
import { IssueCategory, PrismaClient, ProjectStatus, ProjectType } from '@prisma/client';
import { hash } from 'bcryptjs';
import { config as loadEnv } from 'dotenv';

// CGM 常见问题预置数据
const CGM_KNOWN_ISSUES = [
  // 蓝牙连接类
  {
    title: '蓝牙扫描失败',
    description: '蓝牙设备扫描过程中发生错误，无法发现目标设备',
    solution: '1. 检查蓝牙权限是否已授予\n2. 确认设备在有效范围内（通常3米以内）\n3. 确保设备电量充足\n4. 尝试重启手机蓝牙',
    category: IssueCategory.connection,
    severity: 4,
    eventPattern: 'BLE search failure',
  },
  {
    title: '蓝牙连接失败',
    description: '蓝牙连接目标设备时发生错误',
    solution: '1. 确保设备在有效范围内\n2. 检查设备是否已被其他手机连接\n3. 尝试重新扫描并连接\n4. 如果持续失败，重启设备',
    category: IssueCategory.connection,
    severity: 4,
    eventPattern: 'BLE connection failure',
  },
  {
    title: '蓝牙意外断开',
    description: '蓝牙连接在使用过程中意外断开',
    solution: '1. 检查设备电量\n2. 确保设备与手机距离不超过3米\n3. 避免蓝牙信号干扰（如微波炉、WiFi路由器附近）\n4. 检查是否有其他App抢占蓝牙连接',
    category: IssueCategory.connection,
    severity: 3,
    eventPattern: 'BLE disconnect',
  },
  {
    title: '蓝牙鉴权失败',
    description: '设备鉴权/配对过程失败',
    solution: '1. 确认设备是否已绑定到其他账号\n2. 尝试在手机蓝牙设置中取消配对后重试\n3. 确保使用正确的激活码',
    category: IssueCategory.connection,
    severity: 4,
    eventPattern: 'BLE auth failure',
  },
  {
    title: '蓝牙开关已关闭',
    description: '检测到手机蓝牙开关处于关闭状态',
    solution: '请打开手机蓝牙开关后重试',
    category: IssueCategory.connection,
    severity: 3,
    eventPattern: 'Bluetooth switch is off',
  },

  // SDK 初始化类
  {
    title: 'SDK初始化失败',
    description: 'CGM SDK初始化过程发生错误',
    solution: '1. 检查App是否有完整权限\n2. 确认SDK配置是否正确\n3. 检查网络连接\n4. 尝试重启App',
    category: IssueCategory.app,
    severity: 4,
    eventPattern: 'SDK init failure',
  },
  {
    title: 'SDK权限错误',
    description: 'SDK授权验证失败',
    solution: '1. 检查App的SDK授权是否有效\n2. 确认授权码是否正确\n3. 联系技术支持确认授权状态',
    category: IssueCategory.permission,
    severity: 4,
    eventPattern: 'SDK auth error',
  },

  // 设备操作类
  {
    title: '设备状态查询失败',
    description: '无法获取设备当前状态信息',
    solution: '1. 确保蓝牙连接正常\n2. 检查设备是否正常工作\n3. 尝试重新连接设备',
    category: IssueCategory.device,
    severity: 3,
    eventPattern: 'BLE query device status failure',
  },
  {
    title: '设备激活失败',
    description: '设备激活/绑定过程失败',
    solution: '1. 确认激活码是否正确\n2. 检查设备是否已被激活\n3. 确保网络连接正常\n4. 联系客服确认设备状态',
    category: IssueCategory.device,
    severity: 4,
    eventPattern: 'BLE activation failure',
  },
  {
    title: '设备停用失败',
    description: '设备停用/解绑过程失败',
    solution: '1. 确保蓝牙连接正常\n2. 重试停用操作\n3. 如持续失败，联系客服协助处理',
    category: IssueCategory.device,
    severity: 3,
    eventPattern: 'BLE deactivation failure',
  },
  {
    title: '设备SN查询失败',
    description: '无法获取设备序列号',
    solution: '1. 确保蓝牙连接正常\n2. 重新连接设备后重试',
    category: IssueCategory.device,
    severity: 2,
    eventPattern: 'BLE query sn failure',
  },

  // 数据类
  {
    title: '历史数据获取失败',
    description: '从设备获取历史血糖数据时发生错误',
    solution: '1. 确保蓝牙连接稳定\n2. 保持手机靠近设备\n3. 等待数据同步完成后重试',
    category: IssueCategory.data,
    severity: 3,
    eventPattern: 'BLE start getData error',
  },
  {
    title: '数据接收错误',
    description: '接收设备传输的数据时发生错误',
    solution: '1. 保持蓝牙连接稳定\n2. 避免在数据传输过程中移动设备\n3. 重新连接后重试',
    category: IssueCategory.data,
    severity: 4,
    eventPattern: 'BLE data receive error',
  },
  {
    title: '数据错误',
    description: '血糖数据解析或校验失败',
    solution: '1. 重新同步数据\n2. 如持续出现，可能是设备异常，请联系客服',
    category: IssueCategory.data,
    severity: 4,
    eventPattern: 'Data error',
  },

  // 网络类
  {
    title: '网络错误',
    description: '网络请求失败',
    solution: '1. 检查网络连接\n2. 确认是否处于飞行模式\n3. 尝试切换WiFi/移动网络\n4. 检查服务器状态',
    category: IssueCategory.protocol,
    severity: 3,
    eventPattern: 'Network error',
  },

  // 通用错误
  {
    title: '蓝牙通用错误',
    description: '蓝牙操作过程中发生未知错误',
    solution: '1. 重启手机蓝牙\n2. 重新连接设备\n3. 如持续出现，请提供日志联系技术支持',
    category: IssueCategory.connection,
    severity: 4,
    eventPattern: 'BLE error',
  },
  {
    title: '设备通用错误',
    description: '设备操作过程中发生未知错误',
    solution: '1. 重新连接设备\n2. 检查设备状态\n3. 如持续出现，请联系客服',
    category: IssueCategory.device,
    severity: 4,
    eventPattern: 'Device error',
  },
  {
    title: '通用错误',
    description: '发生未知错误',
    solution: '请提供完整日志联系技术支持分析',
    category: IssueCategory.other,
    severity: 3,
    eventPattern: 'GENERIC Error',
  },
];

function tryLoadEnvFile(relativePath: string) {
  const fullPath = path.resolve(process.cwd(), relativePath);
  if (!fs.existsSync(fullPath)) return;
  loadEnv({ path: fullPath });
}

tryLoadEnvFile('.env');
tryLoadEnvFile('../../.env');

const prisma = new PrismaClient();

async function main() {
  const roles = ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'];

  for (const name of roles) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@local.dev';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'admin123456';
  const adminName = process.env.SEED_ADMIN_NAME ?? 'Admin';

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'Admin' },
  });

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: adminName,
      passwordHash: await hash(adminPassword, 10),
      status: 'active',
    },
  });

  const projectName = 'CGM SDK';
  const project =
    (await prisma.project.findFirst({ where: { name: projectName } })) ??
    (await prisma.project.create({
      data: {
        name: projectName,
        type: ProjectType.SDK,
        status: ProjectStatus.active,
      },
    }));

  await prisma.projectMember.upsert({
    where: {
      projectId_userId: { projectId: project.id, userId: adminUser.id },
    },
    update: { roleId: adminRole.id },
    create: {
      projectId: project.id,
      userId: adminUser.id,
      roleId: adminRole.id,
    },
  });

  // 创建 CGM 常见问题
  let issuesCreated = 0;
  for (const issue of CGM_KNOWN_ISSUES) {
    const existing = await prisma.knownIssue.findFirst({
      where: {
        projectId: project.id,
        eventPattern: issue.eventPattern,
      },
    });

    if (!existing) {
      await prisma.knownIssue.create({
        data: {
          projectId: project.id,
          title: issue.title,
          description: issue.description,
          solution: issue.solution,
          category: issue.category,
          severity: issue.severity,
          eventPattern: issue.eventPattern,
          createdBy: adminUser.id,
        },
      });
      issuesCreated++;
    }
  }

  console.log('Seed complete:', {
    adminEmail,
    projectId: project.id,
    issuesCreated,
    totalIssues: CGM_KNOWN_ISSUES.length,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
