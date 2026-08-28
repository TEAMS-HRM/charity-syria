import { Injectable } from "@nestjs/common";
import { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service";
import { resolveTenant } from "./tenant";

interface OrganizationRow extends QueryResultRow {
  id: string;
  name: string;
  slug: string;
  schema_name: string;
  status: "provisioning" | "active" | "suspended" | "failed";
}

interface MembershipRow extends QueryResultRow {
  role: "owner" | "admin" | "member";
}

export interface ResolvedTenantContext {
  host: string;
  slug: string | null;
  schema: string;
  status: "global" | "active" | "not-found";
  organization: {
    id: string;
    name: string;
    slug: string;
    schemaName: string;
  } | null;
}

@Injectable()
export class TenantService {
  constructor(private readonly database: DatabaseService) {}

  async resolve(host: string, rootDomain: string): Promise<ResolvedTenantContext> {
    const parsed = resolveTenant(host, rootDomain);

    if (!parsed.tenantCandidate) {
      if (parsed.underRootDomain && parsed.host !== rootDomain.toLowerCase()) {
        return {
          host: parsed.host,
          slug: null,
          schema: "public",
          status: "not-found",
          organization: null,
        };
      }

      return {
        host: parsed.host,
        slug: null,
        schema: "public",
        status: "global",
        organization: null,
      };
    }

    const slug = parsed.slug;
    if (!slug) {
      return {
        host: parsed.host,
        slug: null,
        schema: "public",
        status: "not-found",
        organization: null,
      };
    }

    const organization = await this.lookupOrganization(slug);
    if (!organization || organization.status !== "active") {
      return {
        host: parsed.host,
        slug: parsed.slug,
        schema: "public",
        status: "not-found",
        organization: null,
      };
    }

    return {
      host: parsed.host,
      slug: organization.slug,
      schema: organization.schema_name,
      status: "active",
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        schemaName: organization.schema_name,
      },
    };
  }

  private async lookupOrganization(slug: string): Promise<OrganizationRow | null> {
    const result = await this.database.query<OrganizationRow>(
      `
      SELECT id, name, slug, schema_name, status
      FROM public.organizations
      WHERE lower(slug) = lower($1)
      LIMIT 1
      `,
      [slug],
    );

    return result.rows[0] ?? null;
  }

  async getActiveMembership(
    organizationId: string,
    cognitoSub: string,
  ): Promise<{ role: "owner" | "admin" | "member" } | null> {
    const result = await this.database.query<MembershipRow>(
      `
      SELECT om.role
      FROM public.organization_memberships om
      JOIN public.users u ON u.id = om.user_id
      WHERE om.organization_id = $1
        AND u.cognito_sub = $2
        AND om.status = 'active'
      LIMIT 1
      `,
      [organizationId, cognitoSub],
    );

    const membership = result.rows[0];
    if (!membership) {
      return null;
    }

    return { role: membership.role };
  }
}
