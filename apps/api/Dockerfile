FROM node:20-slim AS deps
WORKDIR /app/apps/api
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci

FROM node:20-slim AS build
WORKDIR /app/apps/api
COPY --from=deps /app/apps/api/node_modules ./node_modules
COPY apps/api/ ./
RUN npm run db:generate
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app/apps/api
ENV NODE_ENV=production
COPY --from=build /app/apps/api/package.json ./
COPY --from=build /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/prisma ./prisma
EXPOSE 3001
CMD ["node", "dist/src/main"]
