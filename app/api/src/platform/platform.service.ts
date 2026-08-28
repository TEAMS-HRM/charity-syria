import { ForbiddenException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { QueryResultRow } from "pg";
import { AuthService } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";

interface UserRow extends QueryResultRow {
  id: string;
}

@Injectable()
export class PlatformService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authService: AuthService,
  ) {}

  async bootstrapAdmin(sub: string, email?: string): Promise<{ userId: string; sub: string }> {
    if (this.authService.isEnabled()) {
      throw new ForbiddenException("bootstrap-admin is disabled when Cognito auth is enabled");
    }

    const user = await this.upsertUser(sub, email);

    await this.database.query(
      `
      INSERT INTO public.platform_admins (user_id)
      SELECT $1
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.platform_admins
        WHERE user_id = $1
      )
      `,
      [user.id],
    );

    return { userId: user.id, sub };
  }

  private async upsertUser(sub: string, email?: string): Promise<UserRow> {
    let result = await this.database.query<UserRow>(
      `
      UPDATE public.users
      SET
        email = COALESCE($2, public.users.email),
        updated_at = now()
      WHERE cognito_sub = $1
      RETURNING id
      `,
      [sub, email ?? null],
    );

    if (!result.rows[0]) {
      result = await this.database.query<UserRow>(
        `
        INSERT INTO public.users (id, cognito_sub, email, email_verified)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        `,
        [randomUUID(), sub, email ?? null, Boolean(email)],
      );
    }

    return result.rows[0];
  }
}
