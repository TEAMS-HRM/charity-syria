import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { loadConfig } from "../../config";
import { TenantService } from "../../tenant/tenant.service";
import { RequestUserContext } from "../auth.types";

@Injectable()
export class TenantMembershipGuard implements CanActivate {
  private readonly rootDomain = loadConfig().rootDomain;

  constructor(private readonly tenantService: TenantService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest & RequestUserContext>();
    const userSub = request.user?.sub;

    if (!userSub) {
      throw new UnauthorizedException("Authentication required");
    }

    const tenant = await this.tenantService.resolve(request.headers.host ?? "", this.rootDomain);

    if (tenant.status === "not-found") {
      throw new NotFoundException("Organization not found or inactive");
    }

    if (tenant.status !== "active" || !tenant.organization) {
      throw new ForbiddenException("This endpoint requires an organization subdomain");
    }

    const membership = await this.tenantService.getActiveMembership(tenant.organization.id, userSub);

    if (!membership) {
      throw new ForbiddenException("Active membership in this organization is required");
    }

    request.tenant = {
      organizationId: tenant.organization.id,
      slug: tenant.organization.slug,
      schema: tenant.organization.schemaName,
      role: membership.role,
    };

    return true;
  }
}
