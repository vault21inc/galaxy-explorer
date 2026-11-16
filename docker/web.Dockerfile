# The site's front door (M8-T4): Caddy with the web app's production build, the Caddyfile
# and the security headers (ops/caddy/). Build from the repository root:
#
#   docker build -f docker/web.Dockerfile -t galaxy-explorer-web .
#
# Build arguments are the web app's build settings (VITE_*): VITE_TEST_HOOKS=1 exposes
# window.__GE_TEST__ for the e2e tests run against the stack; a site leaves it unset.

FROM node:26.12.0-trixie-slim AS build
RUN npm install --global pnpm@12.16.1 && rm -rf /root/.npm
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/mcp/package.json apps/mcp/
COPY apps/web/package.json apps/web/
COPY packages/api-client/package.json packages/api-client/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
RUN pnpm install --frozen-lockfile --filter "@ge/web..."
COPY apps/web apps/web
COPY packages/api-client packages/api-client
COPY packages/config packages/config
COPY packages/domain packages/domain
ARG VITE_TEST_HOOKS=""
ARG VITE_DEFAULT_LABEL_MODE=""
ARG VITE_DEFAULT_SPOILERS=""
ENV VITE_TEST_HOOKS=$VITE_TEST_HOOKS \
  VITE_DEFAULT_LABEL_MODE=$VITE_DEFAULT_LABEL_MODE \
  VITE_DEFAULT_SPOILERS=$VITE_DEFAULT_SPOILERS
RUN pnpm --filter @ge/web build

FROM caddy:2.11.9-alpine
COPY --from=build /app/apps/web/dist /srv/web
COPY ops/caddy/Caddyfile ops/caddy/security-headers.caddy ops/caddy/link-previews.caddy /etc/caddy/
