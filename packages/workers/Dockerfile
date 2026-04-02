FROM node:22-alpine AS base
WORKDIR /app

# Copy all package.json files so npm can resolve the full workspace
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/workers/package.json packages/workers/
COPY packages/api/package.json packages/api/
COPY packages/frontend/package.json packages/frontend/
RUN npm pkg delete scripts.prepare && npm install --ignore-scripts

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/workers/ packages/workers/

RUN npm run build --workspace=packages/shared && \
    npm run build --workspace=packages/workers

FROM node:22-alpine
WORKDIR /app

COPY --from=base /app/node_modules ./node_modules/
COPY --from=base /app/packages/shared/dist ./packages/shared/dist/
COPY --from=base /app/packages/shared/package.json ./packages/shared/
COPY --from=base /app/packages/workers/dist ./packages/workers/dist/
COPY --from=base /app/packages/workers/package.json ./packages/workers/
COPY --from=base /app/packages/workers/src/instrument.mjs ./packages/workers/src/instrument.mjs
COPY --from=base /app/package.json ./

RUN mkdir -p node_modules/@twmail && \
    ln -sf /app/packages/shared node_modules/@twmail/shared

ENV NODE_ENV=production
CMD ["node", "--import", "./packages/workers/src/instrument.mjs", "packages/workers/dist/index.js"]
