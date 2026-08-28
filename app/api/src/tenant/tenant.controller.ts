import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { AuthenticatedGuard } from "../auth/guards/authenticated.guard";
import { TenantMembershipGuard } from "../auth/guards/tenant-membership.guard";
import { RequestUserContext } from "../auth/auth.types";

@Controller("tenant")
export class TenantController {
  @Get("context")
  @UseGuards(AuthenticatedGuard, TenantMembershipGuard)
  async context(@Req() request: FastifyRequest & RequestUserContext): Promise<Record<string, unknown>> {
    const user = request.user;
    const tenant = request.tenant;

    return {
      host: request.headers.host ?? "",
      user: {
        sub: user?.sub,
        email: user?.email,
      },
      tenant,
    };
  }
}
