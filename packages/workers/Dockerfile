FROM node:22-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/workers/package.json packages/workers/
RUN npm install --workspace=packages/shared --workspace=packages/workers

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/workers/ packages/workers/

RUN npm run build --workspace=packages/shared && \
    npm run build --workspace=packages/workers

FROM node:22-alpine
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
COPY --from=base /app/packages/shared/package.json ./packages/shared/
COPY --from=base /app/packages/workers/dist ./packages/workers/dist
COPY --from=base /app/packages/workers/package.json ./packages/workers/
# instrument.mjs is plain ESM source — copy it so --import can load it at runtime
COPY --from=base /app/packages/workers/src/instrument.mjs ./packages/workers/src/instrument.mjs
COPY --from=base /app/package.json ./

ENV NODE_ENV=production
CMD ["node", "--import", "./packages/workers/src/instrument.mjs", "packages/workers/dist/index.js"]
