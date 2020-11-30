Build docker image

```bash
docker build -t dappnode-cert-api .
```

Run tests

```bash
docker run -it -p 5000:5000 -v certbot-config:/etc/letsencrypt/ -e CREDS_LOCATION=/etc/letsencrypt/creds.ini -e DEBUG=1 dappnode-cert-api test
```
