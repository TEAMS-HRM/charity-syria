/**
 * Works out which tenant a request belongs to from its Host header.
 *
 * The wildcard DNS record and wildcard certificate from Phase 4 mean every
 * <tenant>.staging.charity-syria.com already resolves and terminates TLS with
 * no per-tenant infrastructure. This is the function that gives that routing
 * meaning.
 */
export interface TenantContext {
  /** Subdomain as requested, or null when the host is the bare root domain. */
  slug: string | null;
  /** Postgres schema the tenant's data lives in. */
  schema: string;
  host: string;
  underRootDomain: boolean;
  tenantCandidate: boolean;
}

// Reserved names that are never a tenant, even though they are subdomains.
const RESERVED = new Set(["www", "api", "admin", "app", "static", "assets"]);

export function resolveTenant(host: string, rootDomain: string): TenantContext {
  // Host can carry a port (localhost:8080) - the name is all we want.
  const hostname = (host ?? "").split(":")[0].toLowerCase();
  const normalizedRoot = rootDomain.toLowerCase();

  if (!hostname) {
    return {
      slug: null,
      schema: "public",
      host: hostname,
      underRootDomain: false,
      tenantCandidate: false,
    };
  }

  if (hostname === normalizedRoot) {
    return {
      slug: null,
      schema: "public",
      host: hostname,
      underRootDomain: true,
      tenantCandidate: false,
    };
  }

  if (!hostname.endsWith(`.${normalizedRoot}`)) {
    return {
      slug: null,
      schema: "public",
      host: hostname,
      underRootDomain: false,
      tenantCandidate: false,
    };
  }

  const slug = hostname.slice(0, -(normalizedRoot.length + 1));

  // Only a single label counts. a.b.staging.charity-syria.com is not a tenant.
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug) || RESERVED.has(slug)) {
    return {
      slug: null,
      schema: "public",
      host: hostname,
      underRootDomain: true,
      tenantCandidate: false,
    };
  }

  return {
    slug,
    // Hyphens are legal in a subdomain but awkward in an unquoted identifier.
    schema: `tenant_${slug.replace(/-/g, "_")}`,
    host: hostname,
    underRootDomain: true,
    tenantCandidate: true,
  };
}
