type RedisConnection = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: Record<string, unknown>;
  maxRetriesPerRequest?: null;
};

export function parseRedisUrl(redisUrl: string): RedisConnection {
  const u = new URL(redisUrl);
  if (u.protocol !== 'redis:' && u.protocol !== 'rediss:') {
    throw new Error(`Unsupported REDIS_URL protocol: ${u.protocol}`);
  }

  const port = u.port ? Number(u.port) : 6379;
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error('Invalid REDIS_URL port');
  }

  const dbRaw = u.pathname.replace(/^\//, '');
  const db = dbRaw ? Number(dbRaw) : undefined;
  if (db !== undefined && (!Number.isInteger(db) || db < 0)) {
    throw new Error('Invalid REDIS_URL db');
  }

  return {
    host: u.hostname,
    port,
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db,
    tls: u.protocol === 'rediss:' ? {} : undefined,
    // BullMQ recommends disabling this for long blocking commands.
    maxRetriesPerRequest: null,
  };
}
