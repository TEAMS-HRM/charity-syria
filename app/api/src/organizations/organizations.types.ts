export type OrganizationStatus = "provisioning" | "active" | "suspended" | "failed";

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  founderSub: string;
  founderEmail?: string;
}

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  schemaName: string;
  status: OrganizationStatus;
  createdAt: string;
}

export interface ProvisioningStatusRecord {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationStatus: OrganizationStatus;
  jobStatus: "queued" | "running" | "failed" | "completed";
  attempts: number;
  lastError: string | null;
  updatedAt: string;
}

export interface OrganizationListItem {
  id: string;
  name: string;
  slug: string;
  schemaName: string;
  status: OrganizationStatus;
  provisioningStatus: "queued" | "running" | "failed" | "completed" | null;
  provisioningAttempts: number | null;
  createdAt: string;
  updatedAt: string;
}
