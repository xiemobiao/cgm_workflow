import { INestApplication, RequestMethod } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  IncidentSeverity,
  IncidentStatus,
  PrismaClient,
  ProjectStatus,
  ProjectType,
} from '@prisma/client';
import { hash } from 'bcryptjs';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

const hasDb = Boolean(process.env.DATABASE_URL);
const maybeDescribe = hasDb ? describe : describe.skip;

type ApiError = { code: string; message: string };
type ApiResponse<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: ApiError };

function unwrap<T>(body: unknown): T {
  if (!body || typeof body !== 'object') throw new Error('invalid body');
  const res = body as ApiResponse<T>;
  if (res.success !== true) {
    const code = res.error?.code ?? 'UNKNOWN';
    const message = res.error?.message ?? 'Request failed';
    throw new Error(`${code}: ${message}`);
  }
  return res.data;
}

async function resetDb(prisma: PrismaClient) {
  await prisma.incidentLogLink.deleteMany();
  await prisma.logFileAnalysis.deleteMany();
  await prisma.analysisReport.deleteMany();
  await prisma.knownIssue.deleteMany();
  await prisma.anomalyPattern.deleteMany();
  await prisma.deviceSession.deleteMany();
  await prisma.logEventStats.deleteMany();
  await prisma.logEvent.deleteMany();
  await prisma.logFile.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
}

async function waitFor<T>(
  fn: () => Promise<T>,
  params: { timeoutMs: number; intervalMs: number },
): Promise<T> {
  const start = Date.now();
  for (;;) {
    try {
      return await fn();
    } catch {
      if (Date.now() - start > params.timeoutMs) throw new Error('timeout');
      await new Promise((r) => setTimeout(r, params.intervalMs));
    }
  }
}

maybeDescribe('MVP flow (e2e + db)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let adminToken = '';
  let devToken = '';
  let projectId = '';

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    await resetDb(prisma);

    const roles = ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'];
    for (const name of roles) {
      await prisma.role.upsert({
        where: { name },
        update: {},
        create: { name },
      });
    }
    const adminRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'Admin' },
    });
    const devRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'Dev' },
    });

    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@local.dev',
        name: 'Admin',
        passwordHash: await hash('admin123456', 10),
        status: 'active',
      },
    });
    const devUser = await prisma.user.create({
      data: {
        email: 'dev@local.dev',
        name: 'Dev',
        passwordHash: await hash('dev123456', 10),
        status: 'active',
      },
    });

    const project = await prisma.project.create({
      data: {
        name: 'Test Project',
        type: ProjectType.SDK,
        status: ProjectStatus.active,
      },
    });
    projectId = project.id;

    await prisma.projectMember.createMany({
      data: [
        { projectId: project.id, userId: adminUser.id, roleId: adminRole.id },
        { projectId: project.id, userId: devUser.id, roleId: devRole.id },
      ],
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', {
      exclude: [{ path: 'health', method: RequestMethod.GET }],
    });
    await app.init();

    const login = async (email: string, password: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password })
        .expect(200);
      const data = unwrap<{ token: string }>(res.body as unknown);
      expect(typeof data.token).toBe('string');
      return data.token;
    };

    adminToken = await login('admin@local.dev', 'admin123456');
    devToken = await login('dev@local.dev', 'dev123456');
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
  });

  it('Logs upload -> Search -> Incident create/update', async () => {
    const now = Date.now();
    const line1 = JSON.stringify({
      l: now,
      f: 1,
      c: JSON.stringify({
        event: 'SDK init start',
        msg: {},
        sdkInfo: 'v3.5.1',
        terminalInfo: 'Pixel 8 / Android 14',
        appInfo: 'demo-app',
      }),
      n: 'main',
      i: 1,
      m: true,
    });
    const line2 = JSON.stringify({
      l: now + 1,
      f: 2,
      c: JSON.stringify({
        event: 'BLE start searching',
        msg: { foo: 'bar' },
        sdkInfo: 'v3.5.1',
        terminalInfo: 'Pixel 8 / Android 14',
        appInfo: 'demo-app',
      }),
      n: 'main',
      i: 1,
      m: true,
    });
    const buf = Buffer.from(`${line1}\n${line2}\n`, 'utf8');

    const uploadRes = await request(app.getHttpServer())
      .post('/api/logs/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('projectId', projectId)
      .attach('file', buf, {
        filename: 'sample.jsonl',
        contentType: 'text/plain',
      })
      .expect(200);
    unwrap<{ logFileId: string }>(uploadRes.body as unknown);

    const startTime = new Date(now - 60_000).toISOString();
    const endTime = new Date(now + 60_000).toISOString();

    const found = await waitFor(
      async () => {
        const searchRes = await request(app.getHttpServer())
          .get(
            `/api/logs/events/search?projectId=${projectId}&eventName=SDK%20init%20start&startTime=${encodeURIComponent(
              startTime,
            )}&endTime=${encodeURIComponent(endTime)}`,
          )
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
        const data = unwrap<{ items: Array<{ id: string }> }>(
          searchRes.body as unknown,
        );
        const items = data.items;
        if (!items || items.length === 0) throw new Error('not ready');
        return items;
      },
      { timeoutMs: 5_000, intervalMs: 200 },
    );

    const logEventId = found[0].id;

    const incidentRes = await request(app.getHttpServer())
      .post('/api/incidents')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        projectId,
        title: 'BLE reconnect failure',
        severity: IncidentSeverity.high,
        status: IncidentStatus.open,
        startTime: new Date(now).toISOString(),
        logEventIds: [logEventId],
      })
      .expect(200);
    const incident = unwrap<{ id: string; status: string }>(
      incidentRes.body as unknown,
    );
    expect(incident.status).toBe('open');

    const incidentId = incident.id;
    const updateRes = await request(app.getHttpServer())
      .patch(`/api/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: IncidentStatus.resolved,
        endTime: new Date(now + 1000).toISOString(),
      })
      .expect(200);
    const updatedIncident = unwrap<{ status: string }>(
      updateRes.body as unknown,
    );
    expect(updatedIncident.status).toBe('resolved');
  });

  it('Permissions: incident create denied for Dev', async () => {
    await request(app.getHttpServer())
      .post('/api/incidents')
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        projectId,
        title: 'Should be forbidden',
        severity: IncidentSeverity.low,
        status: IncidentStatus.open,
        startTime: new Date().toISOString(),
        logEventIds: [],
      })
      .expect(403);
  });
});
