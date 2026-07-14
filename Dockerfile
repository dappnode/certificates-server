FROM node:24-alpine AS node-builder

WORKDIR /app

# Install all deps to build
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --non-interactive

COPY . ./
RUN yarn run build

# Re-install only production for final layer
RUN rm -rf node_modules && yarn install --frozen-lockfile --non-interactive --production=true

FROM certbot/dns-rfc2136:v5.7.0

RUN apk add --no-cache nodejs && mkdir -p /usr/app
WORKDIR /usr/app

COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/dist .

EXPOSE 5000

ENTRYPOINT ["node", "index.js"]
