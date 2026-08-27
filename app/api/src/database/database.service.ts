import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { loadConfig } from '../config';

export interface DatabaseHealth {
  reachable: boolean;
  /** Round trip for a trivial query, in milliseconds. */
  latencyMs?: number;
  serverVersion?: string;
  /** Connections currently held by this task's pool. */
  pool: { total: number; idle: number; waiting: number };
  error?: string;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor() {
    const { database } = loadConfig();

    this.pool = new Pool({
      host: database.host,
      port: database.port,
      database: database.database,
      user: database.user,
      password: database.password,
      max: database.poolSize,
      // Fargate tasks come and go; don't hold connections open for a dead peer.
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      // rejectUnauthorized stays false until the RDS CA bundle is baked into
      // the image. TLS is still negotiated and the traffic is encrypted - what
      // is not yet verified is the server's identity, which matters far less
      // inside a private subnet than it would across the internet.
      ssl: database.ssl ? { rejectUnauthorized: false } : false,
    });

    // A pool error is emitted for idle clients dropped by the server. Without a
    // listener, Node treats it as an unhandled error and kills the process.
    this.pool.on('error', (error) => {
      this.logger.error({ err: error }, 'idle database client error');
    });
  }

  async onModuleInit(): Promise<void> {
    // Fail loudly at startup rather than on the first request. ECS will not
    // register an unhealthy task with the load balancer, so a bad credential
    // shows up as a failed deploy instead of a 500 for a user.
    const health = await this.check();
    if (!health.reachable) {
      throw new Error(`Database unreachable at startup: ${health.error}`);
    }
    this.logger.log(
      `Database connected in ${health.latencyMs}ms (${health.serverVersion})`,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  /**
   * Runs work against one connection pinned to a tenant's schema. Schema-per-
   * tenant isolation lives here: the search_path is set on the connection, the
   * callback runs, and the path is reset before the connection goes back to the
   * pool - a leak would hand the next request the wrong tenant's data.
   */
  async withTenant<T>(
    schema: string,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
      throw new Error(`Refusing unsafe schema name: ${schema}`);
    }

    const client = await this.pool.connect();
    try {
      await client.query(`SET search_path TO "${schema}", public`);
      return await work(client);
    } finally {
      await client.query('SET search_path TO public').catch(() => undefined);
      client.release();
    }
  }

  async check(): Promise<DatabaseHealth> {
    const startedAt = Date.now();

    try {
      const result = await this.pool.query<{ version: string }>(
        'select version()',
      );

      return {
        reachable: true,
        latencyMs: Date.now() - startedAt,
        // "PostgreSQL 16.13 on x86_64..." trimmed to just the version.
        serverVersion: result.rows[0]?.version.split(' ').slice(0, 2).join(' '),
        pool: {
          total: this.pool.totalCount,
          idle: this.pool.idleCount,
          waiting: this.pool.waitingCount,
        },
      };
    } catch (error) {
      return {
        reachable: false,
        error: error instanceof Error ? error.message : String(error),
        pool: {
          total: this.pool.totalCount,
          idle: this.pool.idleCount,
          waiting: this.pool.waitingCount,
        },
      };
    }
  }
}
