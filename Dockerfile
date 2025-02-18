FROM node:22 AS builder
WORKDIR /app

COPY ./.npmrc ./package.json ./pnpm-lock.yaml .
COPY ./dist ./dist
COPY ./prisma ./prisma

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

ENV NODE_ENV="production"
ENV PRISMA_CLI_BINARY_TARGETS="debian-openssl-3.0.x"

RUN npm install -g pnpm@latest-10
RUN pnpm install --prod --frozen-lockfile

FROM node:22
WORKDIR /app
COPY --chown=node:node --from=builder /app ./
CMD ["npm", "start"]
EXPOSE 8080
