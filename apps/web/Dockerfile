FROM node:20-slim AS deps
WORKDIR /app/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

FROM node:20-slim AS build
WORKDIR /app/apps/web
COPY --from=deps /app/apps/web/node_modules ./node_modules
COPY apps/web/ ./
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app/apps/web
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/apps/web/package.json ./
COPY --from=build /app/apps/web/node_modules ./node_modules
COPY --from=build /app/apps/web/.next ./.next
COPY --from=build /app/apps/web/public ./public
COPY --from=build /app/apps/web/next.config.* ./
EXPOSE 3000
CMD ["npm", "run", "start"]
