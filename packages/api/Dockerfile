FROM node:22-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
RUN npm install --workspace=packages/shared --workspace=packages/api

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/api/ packages/api/

RUN npm run build --workspace=packages/shared && \
    npm run build --workspace=packages/api

FROM node:22-alpine
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
COPY --from=base /app/packages/shared/package.json ./packages/shared/
COPY --from=base /app/packages/api/dist ./packages/api/dist
COPY --from=base /app/packages/api/package.json ./packages/api/
# instrument.mjs is plain ESM source — copy it so --import can load it at runtime
COPY --from=base /app/packages/api/src/instrument.mjs ./packages/api/src/instrument.mjs
COPY --from=base /app/package.json ./

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "--import", "./packages/api/src/instrument.mjs", "packages/api/dist/index.js"]
