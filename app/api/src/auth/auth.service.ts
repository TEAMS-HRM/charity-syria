import { Injectable, UnauthorizedException } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify, JWTPayload } from "jose";
import { IncomingHttpHeaders } from "node:http";
import { loadConfig } from "../config";
import { AuthenticatedUser } from "./auth.types";

@Injectable()
export class AuthService {
  private readonly config = loadConfig();
  private readonly issuer = `https://cognito-idp.${this.config.auth.cognitoRegion}.amazonaws.com/${this.config.auth.userPoolId}`;
  private readonly jwks = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`));

  isEnabled(): boolean {
    return this.config.auth.enabled;
  }

  async authenticateRequest(requestOrHeaders: FastifyRequest | IncomingHttpHeaders): Promise<AuthenticatedUser> {
    const headers = this.extractHeaders(requestOrHeaders);

    if (this.isEnabled()) {
      return this.authenticate(headers.authorization);
    }

    const devSubHeader = headers["x-dev-user-sub"];
    const devSubQuery = this.extractDevQueryValue(requestOrHeaders, "devSub");
    const devSub = Array.isArray(devSubHeader) ? devSubHeader[0] : devSubHeader;
    const resolvedSub = (devSub ?? devSubQuery ?? "").trim();

    if (!resolvedSub) {
      throw new UnauthorizedException(
        "Authentication is disabled. Send x-dev-user-sub header for local guarded endpoint testing",
      );
    }

    const devEmailHeader = headers["x-dev-email"];
    const devEmailQuery = this.extractDevQueryValue(requestOrHeaders, "devEmail");
    const devGroupsHeader = headers["x-dev-groups"];
    const devEmail = Array.isArray(devEmailHeader) ? devEmailHeader[0] : devEmailHeader;
    const devGroupsRaw = Array.isArray(devGroupsHeader) ? devGroupsHeader[0] : devGroupsHeader;

    return {
      sub: resolvedSub,
      email: (devEmail ?? devEmailQuery)?.trim() || undefined,
      emailVerified: true,
      groups: devGroupsRaw
        ? String(devGroupsRaw)
            .split(",")
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
        : [],
      tokenUse: "dev",
      isDevAuth: true,
    };
  }

  private extractHeaders(requestOrHeaders: FastifyRequest | IncomingHttpHeaders): IncomingHttpHeaders {
    if (typeof requestOrHeaders === "object" && requestOrHeaders !== null && "raw" in requestOrHeaders) {
      return (requestOrHeaders as FastifyRequest).headers;
    }
    return requestOrHeaders as IncomingHttpHeaders;
  }

  private extractDevQueryValue(
    requestOrHeaders: FastifyRequest | IncomingHttpHeaders,
    key: string,
  ): string | undefined {
    if (!(typeof requestOrHeaders === "object" && requestOrHeaders !== null && "query" in requestOrHeaders)) {
      return undefined;
    }

    const queryRecord = (requestOrHeaders as FastifyRequest).query as Record<string, unknown>;
    const raw = queryRecord?.[key];
    if (typeof raw === "string") {
      return raw;
    }
    if (Array.isArray(raw) && typeof raw[0] === "string") {
      return raw[0];
    }
    return undefined;
  }

  async authenticate(authHeader?: string): Promise<AuthenticatedUser> {
    if (!this.isEnabled()) {
      throw new UnauthorizedException("Authentication is not configured");
    }

    const token = this.extractBearerToken(authHeader);
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.issuer,
    });

    this.validateAudience(payload);

    return {
      sub: String(payload.sub ?? ""),
      email: payload.email ? String(payload.email) : undefined,
      emailVerified: typeof payload.email_verified === "boolean" ? payload.email_verified : undefined,
      username: payload["cognito:username"] ? String(payload["cognito:username"]) : undefined,
      tokenUse: payload.token_use ? String(payload.token_use) : undefined,
      groups: Array.isArray(payload["cognito:groups"]) ? payload["cognito:groups"].map((group) => String(group)) : [],
    };
  }

  private extractBearerToken(authHeader?: string): string {
    if (!authHeader) {
      throw new UnauthorizedException("Missing Authorization header");
    }

    const [scheme, token] = authHeader.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new UnauthorizedException("Expected Bearer token");
    }

    return token;
  }

  private validateAudience(payload: JWTPayload): void {
    const clientId = this.config.auth.appClientId;
    const candidates = [payload.aud, typeof payload.client_id === "string" ? payload.client_id : undefined].filter(
      (value): value is string => Boolean(value),
    );

    if (!candidates.includes(clientId)) {
      throw new UnauthorizedException("Token audience does not match app client");
    }

    if (!payload.sub) {
      throw new UnauthorizedException("Token is missing subject");
    }
  }
}
