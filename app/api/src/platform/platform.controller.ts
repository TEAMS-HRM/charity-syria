import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { AuthenticatedGuard } from "../auth/guards/authenticated.guard";
import { PlatformAdminGuard } from "../auth/guards/platform-admin.guard";
import { RequestUserContext } from "../auth/auth.types";
import { OrganizationsService } from "../organizations/organizations.service";
import { PlatformService } from "./platform.service";

@Controller("platform")
export class PlatformController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly platform: PlatformService,
  ) {}

  @Post("bootstrap-admin")
  @UseGuards(AuthenticatedGuard)
  async bootstrapAdmin(
    @Req() request: FastifyRequest & RequestUserContext,
    @Body() body: Record<string, unknown>,
  ): Promise<{ ok: boolean; userId: string; sub: string }> {
    const subFromBody = typeof body.sub === "string" ? body.sub.trim() : "";
    const sub = subFromBody || request.user?.sub;
    if (!sub) {
      throw new BadRequestException("User subject is required");
    }

    const email = typeof body.email === "string" && body.email.trim() !== "" ? body.email.trim() : request.user?.email;
    const result = await this.platform.bootstrapAdmin(sub, email);

    return { ok: true, userId: result.userId, sub: result.sub };
  }

  @Get("organizations")
  @UseGuards(AuthenticatedGuard, PlatformAdminGuard)
  async listOrganizations(@Query("limit") limit?: string): Promise<{ items: unknown[]; count: number }> {
    const numericLimit = limit ? Number.parseInt(limit, 10) : 100;
    const items = await this.organizations.listOrganizations(Number.isNaN(numericLimit) ? 100 : numericLimit);

    return {
      items,
      count: items.length,
    };
  }

  @Post("organizations/:id/approve")
  @UseGuards(AuthenticatedGuard, PlatformAdminGuard)
  async approveOrganization(@Param("id") id: string): Promise<Record<string, unknown>> {
    const result = await this.organizations.runProvisioningOnce(id);
    return {
      organizationId: id,
      approved: result.status === "processed",
      ...result,
    };
  }
}
