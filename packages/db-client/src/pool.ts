import { Pool } from "pg";
import type { PoolConfig } from "pg";

export interface DbConfig {
  url: string;
  poolMin?: number;
  poolMax?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
}

export function createPool(config: DbConfig): Pool {
  const poolConfig: PoolConfig = {
    connectionString: config.url,
    min: config.poolMin ?? 2,
    max: config.poolMax ?? 10,
    idleTimeoutMillis: config.idleTimeoutMs ?? 30_000,
    connectionTimeoutMillis: config.connectionTimeoutMs ?? 5_000,
  };
  return new Pool(poolConfig);
}

export function safeLogUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password.length > 0) u.password = "***";
    return u.toString();
  } catch {
    return "<invalid-url>";
  }
}
