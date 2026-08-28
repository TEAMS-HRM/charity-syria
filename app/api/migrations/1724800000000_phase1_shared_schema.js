/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql("CREATE EXTENSION IF NOT EXISTS pgcrypto");

  pgm.createTable(
    { schema: "public", name: "users" },
    {
      id: {
        type: "uuid",
        primaryKey: true,
        default: pgm.func("gen_random_uuid()"),
      },
      cognito_sub: { type: "text", notNull: true, unique: true },
      email: { type: "text" },
      email_verified: { type: "boolean", notNull: true, default: false },
      created_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("now()"),
      },
      updated_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("now()"),
      },
    },
  );

  pgm.createTable(
    { schema: "public", name: "organizations" },
    {
      id: {
        type: "uuid",
        primaryKey: true,
        default: pgm.func("gen_random_uuid()"),
      },
      name: { type: "text", notNull: true },
      slug: { type: "text", notNull: true },
      schema_name: { type: "text", notNull: true, unique: true },
      status: {
        type: "text",
        notNull: true,
        default: "provisioning",
      },
      created_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("now()"),
      },
      updated_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("now()"),
      },
    },
  );

  pgm.addConstraint({ schema: "public", name: "organizations" }, "organizations_slug_format_check", {
    check: "slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'",
  });

  pgm.addConstraint({ schema: "public", name: "organizations" }, "organizations_slug_reserved_check", {
    check: "lower(slug) <> ALL (ARRAY['www','api','admin','app','static','assets'])",
  });

  pgm.addConstraint({ schema: "public", name: "organizations" }, "organizations_status_check", {
    check: "status IN ('provisioning','active','suspended','failed')",
  });

  pgm.createIndex({ schema: "public", name: "organizations" }, "lower(slug)", {
    unique: true,
    name: "organizations_slug_lower_unique_idx",
  });

  pgm.createTable(
    { schema: "public", name: "organization_memberships" },
    {
      organization_id: {
        type: "uuid",
        notNull: true,
        references: "public.organizations(id)",
        onDelete: "CASCADE",
      },
      user_id: {
        type: "uuid",
        notNull: true,
        references: "public.users(id)",
        onDelete: "CASCADE",
      },
      role: { type: "text", notNull: true },
      status: { type: "text", notNull: true, default: "active" },
      created_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("now()"),
      },
      updated_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("now()"),
      },
    },
    {
      constraints: {
        primaryKey: ["organization_id", "user_id"],
      },
    },
  );

  pgm.addConstraint({ schema: "public", name: "organization_memberships" }, "organization_memberships_role_check", {
    check: "role IN ('owner','admin','member')",
  });

  pgm.addConstraint({ schema: "public", name: "organization_memberships" }, "organization_memberships_status_check", {
    check: "status IN ('active','invited','disabled')",
  });

  pgm.createTable(
    { schema: "public", name: "platform_admins" },
    {
      user_id: {
        type: "uuid",
        primaryKey: true,
        references: "public.users(id)",
        onDelete: "CASCADE",
      },
      created_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("now()"),
      },
    },
  );

  pgm.createTable(
    { schema: "public", name: "provisioning_jobs" },
    {
      id: {
        type: "uuid",
        primaryKey: true,
        default: pgm.func("gen_random_uuid()"),
      },
      organization_id: {
        type: "uuid",
        notNull: true,
        unique: true,
        references: "public.organizations(id)",
        onDelete: "CASCADE",
      },
      status: {
        type: "text",
        notNull: true,
        default: "queued",
      },
      attempts: { type: "integer", notNull: true, default: 0 },
      last_error: { type: "text" },
      created_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("now()"),
      },
      updated_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("now()"),
      },
    },
  );

  pgm.addConstraint({ schema: "public", name: "provisioning_jobs" }, "provisioning_jobs_status_check", {
    check: "status IN ('queued','running','failed','completed')",
  });

  pgm.createTable(
    { schema: "public", name: "tenant_schema_versions" },
    {
      organization_id: {
        type: "uuid",
        notNull: true,
        references: "public.organizations(id)",
        onDelete: "CASCADE",
      },
      version: { type: "text", notNull: true },
      applied_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("now()"),
      },
    },
    {
      constraints: {
        primaryKey: ["organization_id", "version"],
      },
    },
  );

  pgm.createTable(
    { schema: "public", name: "platform_audit_log" },
    {
      id: { type: "bigserial", primaryKey: true },
      actor_user_id: {
        type: "uuid",
        references: "public.users(id)",
        onDelete: "SET NULL",
      },
      organization_id: {
        type: "uuid",
        references: "public.organizations(id)",
        onDelete: "SET NULL",
      },
      action: { type: "text", notNull: true },
      metadata: {
        type: "jsonb",
        notNull: true,
        default: pgm.func("'{}'::jsonb"),
      },
      created_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("now()"),
      },
    },
  );

  pgm.createIndex({ schema: "public", name: "platform_audit_log" }, "organization_id");
  pgm.createIndex({ schema: "public", name: "platform_audit_log" }, "created_at");
};

exports.down = (pgm) => {
  pgm.dropTable({ schema: "public", name: "platform_audit_log" });
  pgm.dropTable({ schema: "public", name: "tenant_schema_versions" });
  pgm.dropTable({ schema: "public", name: "provisioning_jobs" });
  pgm.dropTable({ schema: "public", name: "platform_admins" });
  pgm.dropTable({ schema: "public", name: "organization_memberships" });
  pgm.dropTable({ schema: "public", name: "organizations" });
  pgm.dropTable({ schema: "public", name: "users" });
};
