FROM certbot/dns-rfc2136:v1.9.0

RUN apk add --update nodejs npm
#RUN addgroup -S node && adduser -S node -G node


RUN mkdir -p /usr/app
RUN mkdir -p /etc/letsencrypt/csr


#RUN chown node:node /usr/app
#USER node
WORKDIR /usr/app

COPY src ./src
COPY *.json ./

RUN npm install 

EXPOSE 5000
ENTRYPOINT npm start