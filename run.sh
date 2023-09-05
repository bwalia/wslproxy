#!/bin/bash

clear

echo "Running docker-compose up -d."

docker compose down --remove-orphans
docker compose --env-file .env.dev  up -d --build --remove-orphans

DOCKER_CONTAINER_NAME="whitefalcon"

docker exec -it ${DOCKER_CONTAINER_NAME} yarn build

docker exec -it ${DOCKER_CONTAINER_NAME} openresty -s reload

# replace app name in dashboard and other places to whitelabel the api gw
docker exec -it ${DOCKER_CONTAINER_NAME} "/usr/local/openresty/nginx/html/openresty-admin/.env"

HOST_ENDPOINT_UNSECURE_URL="http://localhost:8081"
curl -IL $HOST_ENDPOINT_UNSECURE_URL
os_type=$(uname -s)

if [ "$os_type" = "Darwin" ]; then
open $HOST_ENDPOINT_UNSECURE_URL
fi

if [ "$os_type" = "Linux" ]; then
xdg-open $HOST_ENDPOINT_UNSECURE_URL
fi

HOST_ENDPOINT_UNSECURE_URL="http://localhost:8000"
curl -IL $HOST_ENDPOINT_UNSECURE_URL

if [ "$os_type" = "Darwin" ]; then
open $HOST_ENDPOINT_UNSECURE_URL
fi

if [ "$os_type" = "Linux" ]; then
xdg-open $HOST_ENDPOINT_UNSECURE_URL
fi
