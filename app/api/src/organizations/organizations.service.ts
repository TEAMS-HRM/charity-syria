import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PoolClient, QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service";
import {
  CreateOrganizationInput,
  OrganizationListItem,
  OrganizationRecord,
  ProvisioningStatusRecord,
} from "./organizations.types";

const RESERVED_SLUGS = new Set(["www", "api", "admin", "app", "static", "assets"]);

interface OrganizationInsertRow extends QueryResultRow {
  id: string;
  name: string;
  slug: string;
  schema_name: string;
  status: "provisioning" | "active" | "suspended" | "failed";
  created_at: string;
}

interface UserRow extends QueryResultRow {
  id: string;
}

interface ProvisioningRow extends QueryResultRow {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  organization_status: "provisioning" | "active" | "suspended" | "failed";
  job_status: "queued" | "running" | "failed" | "completed";
  attempts: number;
  last_error: string | null;
  updated_at: string;
}

interface OrganizationListRow extends QueryResultRow {
  id: string;
  name: string;
  slug: string;
  schema_name: string;
  status: "provisioning" | "active" | "suspended" | "failed";
  provisioning_status: "queued" | "running" | "failed" | "completed" | null;
  provisioning_attempts: number | null;
  created_at: string;
  updated_at: string;
}

interface ClaimedJobRow extends QueryResultRow {
  id: string;
  organization_id: string;
  attempts: number;
}

interface OrganizationTargetRow extends QueryResultRow {
  id: string;
  slug: string;
  schema_name: string;
  status: "provisioning" | "active" | "suspended" | "failed";
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly database: DatabaseService) {}

  async checkSlugAvailability(rawSlug: string): Promise<{ available: boolean; slug: string }> {
    const slug = this.normalizeSlug(rawSlug);
    this.validateSlug(slug);

    const result = await this.database.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM public.organizations WHERE lower(slug) = lower($1)) AS exists",
      [slug],
    );

    return { available: !result.rows[0]?.exists, slug };
  }

  async createOrganization(input: CreateOrganizationInput): Promise<OrganizationRecord> {
    const name = input.name?.trim();
    const slug = this.normalizeSlug(input.slug);
    const founderSub = input.founderSub?.trim();
    const founderEmail = input.founderEmail?.trim();

    if (!name || name.length < 2) {
      throw new BadRequestException("Organization name must be at least 2 characters");
    }

    this.validateSlug(slug);

    if (!founderSub) {
      throw new BadRequestException("Founder identity is required");
    }

    const row = await this.database.withClient<OrganizationInsertRow>(async (client) => {
      await client.query("BEGIN");
      try {
        let userResult = await client.query<UserRow>(
          `
          UPDATE public.users
          SET
            email = COALESCE($2, public.users.email),
            updated_at = now()
          WHERE cognito_sub = $1
          RETURNING id
          `,
          [founderSub, founderEmail ?? null],
        );

        if (!userResult.rows[0]) {
          userResult = await client.query<UserRow>(
            `
            INSERT INTO public.users (id, cognito_sub, email, email_verified)
            VALUES ($1, $2, $3, $4)
            RETURNING id
            `,
            [randomUUID(), founderSub, founderEmail ?? null, Boolean(founderEmail)],
          );
        }

        const founderUserId = userResult.rows[0]?.id;
        if (!founderUserId) {
          throw new Error("Failed to upsert founder user");
        }

        const insertResult = await client.query<OrganizationInsertRow>(
          `
          INSERT INTO public.organizations (id, name, slug, schema_name, status)
          VALUES ($1, $2, $3, $4, 'provisioning')
          RETURNING id, name, slug, schema_name, status, created_at
          `,
          [randomUUID(), name, slug, `tenant_${randomUUID().replace(/-/g, "")}`],
        );

        const createdRow = insertResult.rows[0];
        if (!createdRow) {
          throw new Error("Organization insert returned no row");
        }

        const membershipUpdate = await client.query(
          `
          UPDATE public.organization_memberships
          SET role = 'owner', status = 'active', updated_at = now()
          WHERE organization_id = $1 AND user_id = $2
          `,
          [createdRow.id, founderUserId],
        );

        if (membershipUpdate.rowCount === 0) {
          await client.query(
            `
            INSERT INTO public.organization_memberships (organization_id, user_id, role, status)
            VALUES ($1, $2, 'owner', 'active')
            `,
            [createdRow.id, founderUserId],
          );
        }

        await client.query(
          `
          INSERT INTO public.provisioning_jobs (id, organization_id, status)
          VALUES ($1, $2, 'queued')
          `,
          [randomUUID(), createdRow.id],
        );

        await client.query("COMMIT");
        return createdRow;
      } catch (error) {
        await client.query("ROLLBACK");
        const pgError = error as { code?: string };
        if (pgError.code === "23505") {
          throw new ConflictException("Slug is already taken");
        }
        throw error;
      }
    });

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      schemaName: row.schema_name,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  async getProvisioningStatus(organizationId: string): Promise<ProvisioningStatusRecord> {
    const result = await this.database.query<ProvisioningRow>(
      `
      SELECT
        o.id AS organization_id,
        o.name AS organization_name,
        o.slug AS organization_slug,
        o.status AS organization_status,
        pj.status AS job_status,
        pj.attempts,
        pj.last_error,
        pj.updated_at
      FROM public.organizations o
      JOIN public.provisioning_jobs pj ON pj.organization_id = o.id
      WHERE o.id = $1
      LIMIT 1
      `,
      [organizationId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException("Organization not found");
    }

    return {
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      organizationSlug: row.organization_slug,
      organizationStatus: row.organization_status,
      jobStatus: row.job_status,
      attempts: row.attempts,
      lastError: row.last_error,
      updatedAt: row.updated_at,
    };
  }

  async listOrganizations(limit = 100): Promise<OrganizationListItem[]> {
    const boundedLimit = Math.max(1, Math.min(limit, 200));
    const result = await this.database.query<OrganizationListRow>(
      `
      SELECT
        o.id,
        o.name,
        o.slug,
        o.schema_name,
        o.status,
        pj.status AS provisioning_status,
        pj.attempts AS provisioning_attempts,
        o.created_at,
        o.updated_at
      FROM public.organizations o
      LEFT JOIN public.provisioning_jobs pj ON pj.organization_id = o.id
      ORDER BY o.created_at DESC
      LIMIT $1
      `,
      [boundedLimit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      schemaName: row.schema_name,
      status: row.status,
      provisioningStatus: row.provisioning_status,
      provisioningAttempts: row.provisioning_attempts,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async runProvisioningOnce(organizationId?: string): Promise<{
    status: "processed" | "skipped";
    message: string;
    organizationId?: string;
    schemaName?: string;
  }> {
    const claimedJob = organizationId ? await this.claimJobForOrganization(organizationId) : await this.claimNextJob();

    if (!claimedJob) {
      return {
        status: "skipped",
        message: organizationId
          ? "No queued/failed provisioning job for this organization"
          : "No queued/failed provisioning jobs found",
      };
    }

    const target = await this.getOrganizationTarget(claimedJob.organization_id);
    if (!target) {
      await this.markProvisioningFailed(claimedJob.organization_id, "Organization row not found for provisioning job");
      return {
        status: "skipped",
        message: "Provisioning job references missing organization",
        organizationId: claimedJob.organization_id,
      };
    }

    if (target.status === "active") {
      await this.database.query(
        `
        UPDATE public.provisioning_jobs
        SET status = 'completed', last_error = NULL, updated_at = now()
        WHERE organization_id = $1
        `,
        [target.id],
      );

      return {
        status: "processed",
        message: "Organization already active; job marked completed",
        organizationId: target.id,
        schemaName: target.schema_name,
      };
    }

    if (!/^[a-z_][a-z0-9_]*$/.test(target.schema_name)) {
      await this.markProvisioningFailed(target.id, `Unsafe schema name ${target.schema_name}`);
      return {
        status: "skipped",
        message: "Provisioning blocked due to unsafe schema name",
        organizationId: target.id,
      };
    }

    try {
      await this.database.withClient(async (client) => {
        await client.query("BEGIN");
        try {
          await this.ensureTenantSchemaBaseline(client, target.schema_name);

          await client.query(
            `
            UPDATE public.organizations
            SET status = 'active', updated_at = now()
            WHERE id = $1
            `,
            [target.id],
          );

          await client.query(
            `
            UPDATE public.provisioning_jobs
            SET status = 'completed', last_error = NULL, updated_at = now()
            WHERE organization_id = $1
            `,
            [target.id],
          );

          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
    } catch (error) {
      await this.markProvisioningFailed(target.id, this.sanitizeError(error));
      return {
        status: "skipped",
        message: "Provisioning failed; status moved to failed",
        organizationId: target.id,
      };
    }

    return {
      status: "processed",
      message: "Provisioning completed and organization activated",
      organizationId: target.id,
      schemaName: target.schema_name,
    };
  }

  private async claimNextJob(): Promise<ClaimedJobRow | null> {
    const result = await this.database.query<ClaimedJobRow>(
      `
      UPDATE public.provisioning_jobs pj
      SET status = 'running', attempts = attempts + 1, last_error = NULL, updated_at = now()
      WHERE pj.id = (
        SELECT id
        FROM public.provisioning_jobs
        WHERE status IN ('queued', 'failed')
        ORDER BY updated_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id, organization_id, attempts
      `,
    );

    return result.rows[0] ?? null;
  }

  private async claimJobForOrganization(organizationId: string): Promise<ClaimedJobRow | null> {
    const result = await this.database.query<ClaimedJobRow>(
      `
      UPDATE public.provisioning_jobs
      SET status = 'running', attempts = attempts + 1, last_error = NULL, updated_at = now()
      WHERE organization_id = $1
        AND status IN ('queued', 'failed')
      RETURNING id, organization_id, attempts
      `,
      [organizationId],
    );

    return result.rows[0] ?? null;
  }

  private async getOrganizationTarget(organizationId: string): Promise<OrganizationTargetRow | null> {
    const result = await this.database.query<OrganizationTargetRow>(
      `
      SELECT id, slug, schema_name, status
      FROM public.organizations
      WHERE id = $1
      LIMIT 1
      `,
      [organizationId],
    );
    return result.rows[0] ?? null;
  }

  private async ensureTenantSchemaBaseline(client: PoolClient, schemaName: string): Promise<void> {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

    await client.query(
      `
      CREATE TABLE IF NOT EXISTS "${schemaName}".organization_settings (
        key text PRIMARY KEY,
        value jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
      `,
    );

    await client.query(
      `
      CREATE TABLE IF NOT EXISTS "${schemaName}".audit_log (
        id bigserial PRIMARY KEY,
        actor_user_id uuid,
        action text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
      `,
    );
  }

  private async markProvisioningFailed(organizationId: string, errorMessage: string): Promise<void> {
    await this.database.query(
      `
      UPDATE public.organizations
      SET status = 'failed', updated_at = now()
      WHERE id = $1
      `,
      [organizationId],
    );

    await this.database.query(
      `
      UPDATE public.provisioning_jobs
      SET status = 'failed', last_error = $2, updated_at = now()
      WHERE organization_id = $1
      `,
      [organizationId, errorMessage],
    );
  }

  private sanitizeError(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error);
    return text.slice(0, 500);
  }

  private normalizeSlug(input: string): string {
    return (input ?? "").trim().toLowerCase();
  }

  private validateSlug(slug: string): void {
    if (!slug) {
      throw new BadRequestException("Slug is required");
    }

    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) {
      throw new BadRequestException("Slug must be lowercase letters, numbers, or hyphens (max 63 chars)");
    }

    if (RESERVED_SLUGS.has(slug)) {
      throw new BadRequestException("That slug is reserved");
    }
  }
}
