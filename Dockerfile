FROM node:16-alpine AS node-builder

WORKDIR /app

# Install all deps to build
COPY package.json yarn.lock ./
RUN yarn install

COPY . ./
RUN yarn run build

# Re-install only production for final layer
RUN rm -rf node_modules && yarn install --production



FROM certbot/dns-rfc2136:v2.7.1

RUN apk add --update nodejs npm && mkdir -p /usr/app
WORKDIR /usr/app

COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/dist .

EXPOSE 5000

ENTRYPOINT ["node", "index"]