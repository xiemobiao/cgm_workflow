import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

function tryLoadEnvFile(relativePath: string) {
  const fullPath = path.resolve(process.cwd(), relativePath);
  if (!fs.existsSync(fullPath)) return;
  loadEnv({ path: fullPath });
}

tryLoadEnvFile('.env');
tryLoadEnvFile('../../.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
});
