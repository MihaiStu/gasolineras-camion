FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN mkdir -p /app/data
ENV NODE_ENV=production
ENV DB_PATH=/app/data/gasoil.db
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
RUN mkdir -p ./public
EXPOSE 3000
CMD ["node", "server.js"]
