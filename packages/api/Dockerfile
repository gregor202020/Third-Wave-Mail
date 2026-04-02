FROM node:22-alpine AS base
RUN apk add --no-cache python3 make g++
WORKDIR /app

# Copy all package.json files so npm can resolve the full workspace
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/workers/package.json packages/workers/
COPY packages/frontend/package.json packages/frontend/
RUN npm pkg delete scripts.prepare && npm install

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/api/ packages/api/

RUN npm run build --workspace=packages/shared && \
    npm run build --workspace=packages/api

FROM node:22-alpine
WORKDIR /app

COPY --from=base /app/node_modules ./node_modules/
COPY --from=base /app/packages/shared/dist ./packages/shared/dist/
COPY --from=base /app/packages/shared/package.json ./packages/shared/
COPY --from=base /app/packages/api/dist ./packages/api/dist/
COPY --from=base /app/packages/api/package.json ./packages/api/
COPY --from=base /app/packages/api/src/instrument.mjs ./packages/api/src/instrument.mjs
COPY --from=base /app/package.json ./

RUN mkdir -p node_modules/@twmail && \
    ln -sf /app/packages/shared node_modules/@twmail/shared

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "--import", "./packages/api/src/instrument.mjs", "packages/api/dist/index.js"]
