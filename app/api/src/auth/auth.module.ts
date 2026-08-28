import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthenticatedGuard } from "./guards/authenticated.guard";
import { PlatformAdminGuard } from "./guards/platform-admin.guard";

@Module({
  providers: [AuthService, AuthenticatedGuard, PlatformAdminGuard],
  exports: [AuthService, AuthenticatedGuard, PlatformAdminGuard],
})
export class AuthModule {}
