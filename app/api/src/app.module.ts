import { Module, RequestMethod } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AppController } from './app.controller';
import { loadConfig } from './config';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { resolveTenant } from './tenant/tenant';

const config = loadConfig();

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: config.logLevel,

        // One JSON object per line. CloudWatch Logs Insights can query the
        // fields directly, which plain text would not allow.
        formatters: {
          level: (label) => ({ level: label }),
        },
        timestamp: () => `,"time":"${new Date().toISOString()}"`,

        // Correlates every line of one request. ALB sets X-Amzn-Trace-Id, so
        // prefer that - it ties our logs to the load balancer's.
        genReqId: (req) =>
          (req.headers['x-amzn-trace-id'] as string) ?? randomUUID(),

        customProps: (req) => ({
          tenant: resolveTenant(
            (req.headers.host as string) ?? '',
            config.rootDomain,
          ).slug,
        }),

        // Never log cookies or auth headers - these logs are retained for 14
        // days and readable by anyone with CloudWatch access.
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["set-cookie"]',
          ],
          remove: true,
        },

        serializers: {
          req: (req) => ({
            method: req.method,
            url: req.url,
            host: req.headers?.host,
          }),
          res: (res) => ({ statusCode: res.statusCode }),
        },
      },

      // Health checks fire every 30s from each ALB node. Logging them buries
      // real traffic and pays CloudWatch for noise.
      //
      // This must be `exclude`, NOT pinoHttp's `autoLogging.ignore`. nestjs-pino
      // runs as Nest middleware, and under Fastify the request handed to
      // `ignore` has its url rewritten relative to the mount point - it is
      // always "/", so a path test there silently never matches. The serializer
      // runs later against the real request, so the logs look correct while the
      // filter does nothing. Verified: `ignore` saw "/" for a request to
      // "/health".
      exclude: [{ path: 'health', method: RequestMethod.GET }],
    }),
    DatabaseModule,
    HealthModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
