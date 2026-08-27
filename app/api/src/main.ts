import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { loadConfig } from './config';

async function bootstrap(): Promise<void> {
  const config = loadConfig();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // trustProxy: every request arrives via the ALB, so the client IP and the
    // original protocol are in X-Forwarded-* headers rather than the socket.
    new FastifyAdapter({ trustProxy: true }),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));

  // Lets ECS stop a task cleanly: the pool drains instead of connections being
  // severed mid-query when a deploy rolls.
  app.enableShutdownHooks();

  // 0.0.0.0, not localhost - awsvpc networking gives the task its own ENI, and
  // a server bound to loopback is unreachable from the load balancer.
  await app.listen(config.port, '0.0.0.0');

  app.get(Logger).log(
    `API listening on ${config.port} (${config.environment}, root domain ${config.rootDomain})`,
  );
}

bootstrap().catch((error) => {
  // Nest's logger may not exist yet if config or the database failed, so this
  // one path stays on console.
  console.error('Fatal startup error', error);
  process.exit(1);
});
