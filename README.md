# dappnode-cert-api

## Build docker image

```bash
docker build -t dappnode-cert-api .
```
Run the server using docker

```bash
docker run --rm -it -p 5000:5000 \
    -v "<PATH>":/etc/letsencrypt/creds.ini:ro \
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
    -e DEBUG=1 dappnode-cert-api test
```
Example: 

```bash
docker run --rm -it -p 5000:5000 \
    -v "$(pwd)/creds.ini":/etc/letsencrypt/creds.ini:ro \
    -e DEBUG=1 dappnode-cert-api test
```
## Configuration environment variables

| Name  | Default value | Description | 
| ------------- | ------------- | ------------- |
| BASE_DIR  | /etc/letsencrypt/ | Base directory in which certs are stored
| DEBUG  | false  | If true, uses fake certificates |
| RATE_LIMIT_WINDOW_MS  | 3600000  | Size of rate limit interval |
| RATE_LIMIT_MAX  | 5  | Max tries in rate limit interval | 
| DYNDNS_THRESHOLD  | 600  |  Time threshold for validaeting request |
| RENEWAL_TIME_TRESHOLD  | 6500000 | If two requests for same certificate come within this time, old certificate is resent |
| LETSENCRYPT_EMAIL  | None  | Email for letsencrypt account
| CREDS_LOCATION  | /etc/letsencrypt/creds.ini  | Location of credentials file |



