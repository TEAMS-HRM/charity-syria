import { Controller, Get, NotFoundException, Req, Res } from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { loadConfig } from "./config";
import { TenantService } from "./tenant/tenant.service";

@Controller()
export class AppController {
  private readonly rootDomain = loadConfig().rootDomain;

  constructor(private readonly tenantService: TenantService) {}

  private wantsHtml(request: FastifyRequest): boolean {
    const accept = String(request.headers.accept ?? "").toLowerCase();
    return accept.includes("text/html") || accept.includes("*/*");
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  /**
   * Echoes back which tenant the request resolved to. Placeholder for the real
   * application, but it makes wildcard routing visible rather than assumed:
   * hit two different subdomains and the responses differ.
   */
  @Get()
  async root(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const tenant = await this.tenantService.resolve(request.headers.host ?? "", this.rootDomain);

    if (tenant.status === "not-found") {
      throw new NotFoundException("Organization not found or inactive");
    }

    if (tenant.status === "active" && tenant.organization && this.wantsHtml(request)) {
      const safeName = this.escapeHtml(tenant.organization.name);
      const safeSlug = this.escapeHtml(tenant.organization.slug);
      reply.type("text/html; charset=utf-8").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeName}</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: "Segoe UI", Tahoma, Arial, sans-serif;
      background:
        radial-gradient(circle at 10% 10%, rgba(18, 137, 121, 0.15), transparent 40%),
        radial-gradient(circle at 90% 88%, rgba(209, 146, 63, 0.14), transparent 34%),
        #f6f1e8;
      color: #1f2b33;
    }
    .card {
      width: min(720px, calc(100vw - 32px));
      background: #fffdf9;
      border: 1px solid #d8cfbf;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 12px 26px rgba(38, 30, 19, 0.08);
    }
    h1 { margin: 0 0 8px; color: #0e6179; }
    p { margin: 6px 0; color: #60574d; }
    code { background: #eef4f7; padding: 2px 6px; border-radius: 6px; }
  </style>
</head>
<body>
  <section class="card">
    <h1>${safeName}</h1>
    <p>Organization portal is active.</p>
    <p>Slug: <code>${safeSlug}</code></p>
  </section>
</body>
</html>`);
      return;
    }

    reply.send({
      message: "CharityApp API",
      host: tenant.host,
      tenant: tenant.slug,
      schema: tenant.schema,
      scope: tenant.status,
      organization: tenant.organization,
      // The ALB terminates TLS, so the original scheme only survives here.
      proto: request.headers["x-forwarded-proto"] ?? "http",
    });
  }
}
