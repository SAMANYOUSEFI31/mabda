# Online copy of Mabda (one responsive app for phone, tablet and laptop).
FROM node:22-bookworm-slim
WORKDIR /app
RUN npm install -g bun@1.4.4
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build
ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000
CMD ["./node_modules/.bin/tsx", "server.ts"]
