import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { DatabaseService } from "../../database/database.service";
import { RequestUserContext } from "../auth.types";

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly database: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest & RequestUserContext>();
    const userSub = request.user?.sub;

    if (!userSub) {
      throw new UnauthorizedException("Authentication required");
    }

    const result = await this.database.query<{ is_admin: boolean }>(
      `
      SELECT EXISTS (
        SELECT 1
        FROM public.platform_admins pa
        JOIN public.users u ON u.id = pa.user_id
        WHERE u.cognito_sub = $1
      ) AS is_admin
      `,
      [userSub],
    );

    if (!result.rows[0]?.is_admin) {
      throw new ForbiddenException("Platform admin access is required");
    }

    return true;
  }
}
