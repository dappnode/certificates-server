FROM certbot/dns-rfc2136:v1.9.0

RUN apk add --update nodejs npm && mkdir -p /usr/app
WORKDIR /usr/app

COPY . .

RUN npm install 

EXPOSE 5000
ENTRYPOINT npm start