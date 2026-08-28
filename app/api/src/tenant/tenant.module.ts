import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TenantMembershipGuard } from "../auth/guards/tenant-membership.guard";
import { TenantController } from "./tenant.controller";
import { TenantService } from "./tenant.service";

@Module({
  imports: [AuthModule],
  controllers: [TenantController],
  providers: [TenantService, TenantMembershipGuard],
  exports: [TenantService],
})
export class TenantModule {}
