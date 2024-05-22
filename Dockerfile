FROM node:latest AS builder
WORKDIR /app
COPY . .
RUN yarn install --production

FROM cgr.dev/chainguard/node:latest
WORKDIR /app
COPY --chown=node:node --from=builder /app ./
CMD ["/usr/bin/npm", "start"]
EXPOSE 8080
