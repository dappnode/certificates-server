# dappnode-cert-api

## Build docker image

```bash
docker build -t dappnode-cert-api .
```
Run the server using docker

```bash
docker run --rm -it -p 5000:5000 \
    -v "<PATH>":/etc/letsencrypt/creds.ini:ro \
    -e CREDS_LOCATION=/etc/letsencrypt/creds.ini \
    -e DEBUG=1 dappnode-cert-api
```

where `<PATH>` is the path to the `creds.ini` file on your host machine eg.

```
# Target DNS server
dns_rfc2136_server = ns.yourdomain.com
# Target DNS port
dns_rfc2136_port = 53
# TSIG key name
dns_rfc2136_name = <private key name>
# TSIG key secret
dns_rfc2136_secret = <private key>
# TSIG key algorithm
dns_rfc2136_algorithm = HMAC-SHA512
```

## Run tests

```bash
docker run --rm -it -p 5000:5000 \
    -v "<PATH>":/etc/letsencrypt/creds.ini:ro \
    -e CREDS_LOCATION=/etc/letsencrypt/creds.ini \
    -e DEBUG=1 dappnode-cert-api test
```
Example: 

```bash
docker run --rm -it -p 5000:5000 \
    -v "$(pwd)/creds.ini":/etc/letsencrypt/creds.ini:ro \
    -e CREDS_LOCATION=/etc/letsencrypt/creds.ini \
    -e DEBUG=1 dappnode-cert-api test
```
