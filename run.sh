#!/bin/bash

clear

echo "Running docker-compose up -d."

docker compose up -d --build --remove-orphans

DOCKER_CONTAINER_NAME="whitefalcon"

docker exec -it ${DOCKER_CONTAINER_NAME} yarn build

docker exec -it ${DOCKER_CONTAINER_NAME} openresty -s reload