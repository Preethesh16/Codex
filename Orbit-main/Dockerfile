# Build the React frontend and TypeScript backend once, then run one Express
# process that serves both at the same origin.
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY . .
RUN npm ci
# Source checkouts can contain incremental build metadata while their ignored
# output directories are absent. Clear it so TypeScript always emits fresh
# workspace artifacts inside the image.
RUN rm -f packages/*/tsconfig.tsbuildinfo && npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages

# Mount this directory as a persistent volume on the hosting provider.
RUN mkdir -p /data

EXPOSE 5000
CMD ["node", "packages/server/dist/index.js"]
