import { Module } from "@nestjs/common";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";
import { ProvisioningWorkerService } from "./provisioning.worker";

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, ProvisioningWorkerService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
