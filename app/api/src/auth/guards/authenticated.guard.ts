import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { AuthService } from "../auth.service";
import { RequestUserContext } from "../auth.types";

@Injectable()
export class AuthenticatedGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest & RequestUserContext>();
    request.user = await this.authService.authenticateRequest(request);
    return true;
  }
}
