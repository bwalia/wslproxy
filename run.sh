#!/bin/bash

clear

echo "Running docker-compose up -d."

DOCKER_CONTAINER_NAME="whitefalcon-api"

docker exec -it ${DOCKER_CONTAINER_NAME} yarn build
