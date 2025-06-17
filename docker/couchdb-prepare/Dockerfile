# ./docker/couchdb-prepare/Dockerfile

FROM alpine:3.19

# Installer bash + curl
RUN apk add --no-cache bash curl

WORKDIR /app

COPY ./docker/couchdb-prepare/scripts/init-couchdb.sh /app/init-couchdb.sh

# COPY ./scripts/init-couchdb.sh /app/init-couchdb.sh

# COPY .env /app/.env

RUN chmod +x /app/init-couchdb.sh

ENTRYPOINT ["bash", "/app/init-couchdb.sh"]
