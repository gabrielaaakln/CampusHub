# build context is the repository root
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts

FROM deps AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build -w @campushub/shared \
 && npx tsc -p apps/api/tsconfig.json

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# prisma stays a production dependency the migrate step needs the cli in the image
RUN npm ci --omit=dev --ignore-scripts -w @campushub/api -w @campushub/shared --include-workspace-root \
 && npm cache clean --force
COPY --from=build /app/node_modules/.prisma node_modules/.prisma
COPY --from=build /app/node_modules/@prisma node_modules/@prisma
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/prisma apps/api/prisma
# the demo seed reads these at runtime
COPY fixtures fixtures

RUN mkdir -p /app/uploads /app/snapshots && chown -R node:node /app/uploads /app/snapshots
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
