FROM node:22-slim

# Prisma needs OpenSSL at runtime.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate

COPY . .

EXPOSE 3001
# Dev server, same as `npm run dev`. Bind to all interfaces so the port mapping works.
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm run db:seed && npx next dev -p 3001 -H 0.0.0.0"]
