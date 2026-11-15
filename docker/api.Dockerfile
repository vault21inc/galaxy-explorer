# The API's image (M8-T4), also used for the remote MCP server and the one-off migrations
# (docker/compose.prod.yml). Build from the repository root:
#
#   docker build -f docker/api.Dockerfile -t galaxy-explorer-api .
#
# The API runs its TypeScript directly with Node's type stripping (D-21), and Node refuses to
# strip files inside node_modules. So the image keeps the workspace's layout: the packages sit
# in apps/ and packages/, and pnpm links them into node_modules, where Node follows the link
# back to the real path.

FROM node:26.12.0-trixie-slim AS install
# The pnpm of package.json's `packageManager`. Node 25 and later ship without Corepack.
RUN npm install --global pnpm@12.16.1 && rm -rf /root/.npm
WORKDIR /app
# Every workspace manifest, so pnpm sees the workspace the lockfile describes; only the API's
# and the MCP server's production dependencies are installed.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/mcp/package.json apps/mcp/
COPY apps/web/package.json apps/web/
COPY packages/api-client/package.json packages/api-client/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
RUN pnpm install --frozen-lockfile --prod --filter "@ge/api..." --filter "@ge/mcp..."

FROM node:26.12.0-trixie-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=install /app ./
# The source, which runs as it is. The API serves the LLM guide from docs/api (M7-T8).
COPY apps/api/src apps/api/src
COPY apps/mcp/src apps/mcp/src
COPY packages/api-client/src packages/api-client/src
# The MCP server makes its tools from the API's OpenAPI document (M7-T7).
COPY packages/api-client/openapi.json packages/api-client/
COPY packages/db/src packages/db/src
COPY packages/db/migrations packages/db/migrations
COPY packages/domain/src packages/domain/src
COPY docs/api docs/api
# Uploaded images live on a volume mounted here. A new volume takes the directory's owner, so
# the API's user can write to it; everything else in the container is read-only.
RUN mkdir -p /var/lib/galaxy-explorer/media \
  && chown node:node /var/lib/galaxy-explorer/media
USER node
EXPOSE 3000
CMD ["node", "apps/api/src/main.ts"]
