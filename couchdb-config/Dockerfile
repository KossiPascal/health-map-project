# ./docker/couchdb-prepare/Dockerfile

FROM alpine:3.19

# Installer bash + curl
RUN apk add --no-cache bash curl

WORKDIR /app

COPY ./init-couchdb.sh /app/init-couchdb.sh


RUN chmod +x /app/init-couchdb.sh

ENTRYPOINT ["bash", "/app/init-couchdb.sh"]
