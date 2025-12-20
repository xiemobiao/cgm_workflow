import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient, ProjectStatus, ProjectType } from '@prisma/client';
import { hash } from 'bcryptjs';
import { config as loadEnv } from 'dotenv';

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

  console.log('Seed complete:', { adminEmail, projectId: project.id });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
