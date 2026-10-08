FROM 326954429656.dkr.ecr.eu-west-1.amazonaws.com/golden-images/node:24.21.0-trixie-slim-swan.2 AS builder
WORKDIR /app

COPY ./.npmrc ./package.json ./pnpm-lock.yaml ./prisma.config.ts .
COPY ./dist ./dist
COPY ./prisma ./prisma

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN npm install -g pnpm@latest-10
RUN pnpm install --prod --frozen-lockfile

FROM 326954429656.dkr.ecr.eu-west-1.amazonaws.com/golden-images/node:24.21.0-trixie-slim-swan.2
WORKDIR /app
COPY --chown=node:node --from=builder /app ./
CMD ["npm", "start"]
EXPOSE 8080
