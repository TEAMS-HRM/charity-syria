# Build stage: full Node image, dev dependencies, TypeScript compiler.
FROM node:22-bookworm-slim AS build

WORKDIR /build

# Copied separately so a source-only change reuses the cached install layer.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Drop dev dependencies rather than reinstalling: faster, and guarantees the
# runtime tree is exactly what was resolved at build time.
RUN npm prune --omit=dev

# Runtime stage: distroless. No shell, no package manager, non-root by default -
# the same base the hello-world container used.
FROM gcr.io/distroless/nodejs22-debian12:nonroot

WORKDIR /app

COPY --from=build --chown=nonroot:nonroot /build/node_modules ./node_modules
COPY --from=build --chown=nonroot:nonroot /build/dist ./dist
COPY --from=build --chown=nonroot:nonroot /build/package.json ./package.json

ENV NODE_ENV=production

EXPOSE 8080

CMD ["dist/main.js"]
