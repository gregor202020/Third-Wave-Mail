FROM node:22-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/frontend/package.json packages/frontend/
RUN npm install --workspace=packages/shared --workspace=packages/frontend

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/frontend/ packages/frontend/

RUN npm run build --workspace=packages/shared
ENV API_URL=http://api:3000
RUN npm run build --workspace=packages/frontend

FROM node:22-alpine
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/frontend/.next ./packages/frontend/.next
COPY --from=base /app/packages/frontend/public ./packages/frontend/public
COPY --from=base /app/packages/frontend/package.json ./packages/frontend/
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
COPY --from=base /app/packages/shared/package.json ./packages/shared/
COPY --from=base /app/package.json ./

ENV NODE_ENV=production
ENV API_URL=http://api:3000
EXPOSE 3001
CMD ["npx", "--prefix", "packages/frontend", "next", "start", "-p", "3001"]
