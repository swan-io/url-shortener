FROM node:latest AS builder
WORKDIR /app
COPY . .
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN pnpm install --prod --frozen-lockfile

FROM cgr.dev/chainguard/node:latest
WORKDIR /app
COPY --chown=node:node --from=builder /app ./
CMD ["/usr/bin/npm", "start"]
EXPOSE 8080
