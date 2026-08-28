import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { OrganizationsService } from "./organizations.service";

@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get("slug/:slug/availability")
  async slugAvailability(@Param("slug") slug: string): Promise<{ slug: string; available: boolean }> {
    return this.organizations.checkSlugAvailability(slug);
  }

  @Post()
  async create(@Body() body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const name = String(body.name ?? "");
    const slug = String(body.slug ?? "");
    const founderSub = String(body.founderSub ?? "");
    const founderEmail =
      typeof body.founderEmail === "string" && body.founderEmail.trim() !== "" ? body.founderEmail.trim() : undefined;

    const organization = await this.organizations.createOrganization({
      name,
      slug,
      founderSub,
      founderEmail,
    });

    return {
      organization,
      provisioningStatusUrl: `/organizations/${organization.id}/provisioning`,
      orgPortalUrl: `https://${organization.slug}.charity-syria.com`,
      message: "Organization reserved and queued for provisioning",
    };
  }

  @Get(":id/provisioning")
  async provisioning(@Param("id") id: string): Promise<Record<string, unknown>> {
    const status = await this.organizations.getProvisioningStatus(id);
    return {
      organizationId: status.organizationId,
      organizationName: status.organizationName,
      organizationSlug: status.organizationSlug,
      organizationStatus: status.organizationStatus,
      provisioning: {
        status: status.jobStatus,
        attempts: status.attempts,
        lastError: status.lastError,
        updatedAt: status.updatedAt,
      },
    };
  }

  @Post("provisioning/run-once")
  async runProvisioningOnce(@Body() body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const organizationIdRaw = body.organizationId;
    const organizationId =
      typeof organizationIdRaw === "string" && organizationIdRaw.trim() !== "" ? organizationIdRaw.trim() : undefined;

    return this.organizations.runProvisioningOnce(organizationId);
  }
}
