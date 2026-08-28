export interface AuthenticatedUser {
  sub: string;
  email?: string;
  emailVerified?: boolean;
  username?: string;
  groups: string[];
  tokenUse?: string;
  isDevAuth?: boolean;
}

export interface RequestUserContext {
  user?: AuthenticatedUser;
  tenant?: {
    organizationId: string;
    slug: string;
    schema: string;
    role: "owner" | "admin" | "member";
  };
}
