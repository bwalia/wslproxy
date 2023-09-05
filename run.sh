#!/bin/bash

clear

echo "Running docker-compose up -d."

docker compose up -d --build --remove-orphans
docker compose down --remove-orphans

DOCKER_CONTAINER_NAME="whitefalcon"

docker exec -it ${DOCKER_CONTAINER_NAME} yarn build

docker exec -it ${DOCKER_CONTAINER_NAME} openresty -s reload

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
