FROM node:22 AS builder
WORKDIR /app

COPY ./.npmrc ./package.json ./pnpm-lock.yaml .
COPY ./dist ./dist
COPY ./prisma ./prisma

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN npm install -g pnpm@latest-10
RUN pnpm install --prod --frozen-lockfile

FROM node:22
WORKDIR /app
COPY --chown=node:node --from=builder /app ./
CMD ["npm", "start"]
EXPOSE 8080
