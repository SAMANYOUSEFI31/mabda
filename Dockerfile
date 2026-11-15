# Online copy of Mabda (one responsive app for phone, tablet and laptop).
# One tool for install and scripts: Bun (bun.lock is the only lockfile). The server itself runs on Node 22 through tsx,
# because the database driver (better-sqlite3) is a Node native module; see docs/deploy.md «یک ابزار».
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
CMD ["bun", "run", "start"]
