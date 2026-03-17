FROM node:22-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/frontend/package.json packages/frontend/
RUN npm pkg delete scripts.prepare && npm install --workspace=packages/shared --workspace=packages/frontend

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/frontend/ packages/frontend/

RUN npm run build --workspace=packages/shared
ENV API_URL=http://api:3000
ARG NEXT_PUBLIC_SENTRY_DSN=""
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
RUN npm run build --workspace=packages/frontend

FROM node:22-alpine
WORKDIR /app/packages/frontend
COPY --from=base /app/node_modules /app/node_modules
COPY --from=base /app/packages/frontend/.next ./.next
COPY --from=base /app/packages/frontend/public ./public
COPY --from=base /app/packages/frontend/package.json ./
COPY --from=base /app/packages/frontend/node_modules ./node_modules
COPY --from=base /app/packages/shared/dist /app/packages/shared/dist
COPY --from=base /app/packages/shared/package.json /app/packages/shared/
COPY --from=base /app/package.json /app/

ENV NODE_ENV=production
ENV API_URL=http://api:3000
ENV SENTRY_DSN=""
EXPOSE 3001
CMD ["npx", "next", "start", "-p", "3001"]
