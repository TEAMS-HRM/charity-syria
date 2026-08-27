import { Controller, Get, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { loadConfig } from './config';
import { resolveTenant } from './tenant/tenant';

@Controller()
export class AppController {
  private readonly rootDomain = loadConfig().rootDomain;

  /**
   * Echoes back which tenant the request resolved to. Placeholder for the real
   * application, but it makes wildcard routing visible rather than assumed:
   * hit two different subdomains and the responses differ.
   */
  @Get()
  root(@Req() request: FastifyRequest): Record<string, unknown> {
    const tenant = resolveTenant(request.headers.host ?? '', this.rootDomain);

    return {
      message: 'CharityApp API',
      host: tenant.host,
      tenant: tenant.slug,
      schema: tenant.schema,
      // The ALB terminates TLS, so the original scheme only survives here.
      proto: request.headers['x-forwarded-proto'] ?? 'http',
    };
  }
}
