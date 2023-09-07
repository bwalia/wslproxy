#!/bin/bash

set -x

TARGET_ENV_FILE=".env.dev"

if [ -z "$1" ]
  then
    echo "No env file path supplied"
    TARGET_ENV_NAME="dev"
else
    echo "Using .env file: $1"
    TARGET_ENV_NAME="$1"
    TARGET_ENV_FILE=".env.$1"
fi

if [ -f ${TARGET_ENV_FILE} ]; then
    echo "File ${TARGET_ENV_FILE} exists."
else 
    echo "File ${TARGET_ENV_FILE} does not exist."
exit 1
fi

if [ -z "$2" ]
  then
    echo "No docker image name supplied default to whitefalcon"
    DOCKER_CONTAINER_NAME="whitefalcon"
else
    echo "Docker image name: $2"
    DOCKER_CONTAINER_NAME="$2"
fi

TARGET_DOCKER_COMPOSE_FILE="docker-compose.yml"

if [ "$TARGET_ENV_NAME" == "dev" ]; then
    TARGET_DOCKER_COMPOSE_FILE="docker-compose.yml"
elif [ "$TARGET_ENV_NAME" == "syndev" ]; then
    TARGET_DOCKER_COMPOSE_FILE="docker-compose-${TARGET_ENV_NAME}.yml"
elif [ "$TARGET_ENV_NAME" == "syntest" ]; then
    TARGET_DOCKER_COMPOSE_FILE="docker-compose-${TARGET_ENV_NAME}.yml"
elif [ "$TARGET_ENV_NAME" == "synacc" ]; then
    TARGET_DOCKER_COMPOSE_FILE="docker-compose-${TARGET_ENV_NAME}.yml"
elif [ "$TARGET_ENV_NAME" == "synprod" ]; then
    TARGET_DOCKER_COMPOSE_FILE="docker-compose-${TARGET_ENV_NAME}.yml"
fi

if [ -f .env ]; then
truncate -s 0 .env
fi

cp ${TARGET_ENV_FILE} .env
# replace app name in dashboard and other places to whitelabel the api gw
echo '' >> .env
echo 'VITE_APP_VERSION: "2.0.0"' >> .env
echo 'VITE_DEPLOYMENT_TIME: "20230906205429"' >> .env
echo 'VITE_APP_BUILD_NUMBER: "205429"' >> .env

echo "Running docker-compose up -d."

DOCKER_COMPOSE_BIN=$(which docker-compose)

${DOCKER_COMPOSE_BIN} -f ${TARGET_DOCKER_COMPOSE_FILE} --env-file ${TARGET_ENV_FILE} down --remove-orphans
    sleep 5
${DOCKER_COMPOSE_BIN} -f ${TARGET_DOCKER_COMPOSE_FILE} --env-file ${TARGET_ENV_FILE} up -d --build --remove-orphans

# echo "${DOCKER_COMPOSE_BIN} -f ${TARGET_DOCKER_COMPOSE_FILE} --env-file ${TARGET_ENV_FILE} up -d --build --remove-orphans"
# exit 0

sleep 5
docker exec -i ${DOCKER_CONTAINER_NAME} yarn build
docker exec -i ${DOCKER_CONTAINER_NAME} chmod -R 777 /opt/nginx/data/
# && chown -R root:root /opt/nginx/data/
docker exec -i ${DOCKER_CONTAINER_NAME} openresty -s reload
echo "Loaded env file content from within the container: .env :"
docker exec -i ${DOCKER_CONTAINER_NAME} cat .env

#rm -Rf .env
docker system prune -f
# --all --volumes
