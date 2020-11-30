# dappnode-cert-api

## Build docker image

```bash
docker build -t dappnode-cert-api .
```

## Run tests

```bash
docker run --rm -it -p 5000:5000 \
    -v "<PATH>":/etc/letsencrypt/creds.ini:ro \
    -e CREDS_LOCATION=/etc/letsencrypt/creds.ini \
    -e DEBUG=1 dappnode-cert-api test
```

where `<PATH>` is the path to the `creds.ini` file on your host machine eg.

```bash
docker run --rm -it -p 5000:5000 \
    -v "$(pwd)/creds.ini":/etc/letsencrypt/creds.ini:ro \
    -e CREDS_LOCATION=/etc/letsencrypt/creds.ini \
    -e DEBUG=1 dappnode-cert-api test
```
