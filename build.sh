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

if [ -z "$3" ]
  then
    echo "No JWT token supplied default to whitefalcon"
else 
    JWT_TOKEN_KEY="$3"
fi

TARGET_DOCKER_COMPOSE_FILE="docker-compose.yml"

if [ "$TARGET_ENV_NAME" == "dev" ]; then
    TARGET_DOCKER_COMPOSE_FILE="docker-compose.yml"
    API_URL="http://localhost:8080/api"
    FRONT_URL="http://localhost:8000"
elif [ "$TARGET_ENV_NAME" == "syndev" ]; then
    TARGET_DOCKER_COMPOSE_FILE="docker-compose-${TARGET_ENV_NAME}.yml"
    API_URL="http://localhost:8080/api"
    FRONT_URL="http://localhost:8000"
elif [ "$TARGET_ENV_NAME" == "syntest" ]; then
    TARGET_DOCKER_COMPOSE_FILE="docker-compose-${TARGET_ENV_NAME}.yml"
    API_URL="http://localhost:8088/api"
    FRONT_URL="http://localhost:8008"
elif [ "$TARGET_ENV_NAME" == "synacc" ]; then
    TARGET_DOCKER_COMPOSE_FILE="docker-compose-${TARGET_ENV_NAME}.yml"
    API_URL="http://localhost:8090/api"
    FRONT_URL="http://localhost:8009"
elif [ "$TARGET_ENV_NAME" == "synprod" ]; then
    TARGET_DOCKER_COMPOSE_FILE="docker-compose-${TARGET_ENV_NAME}.yml"
    API_URL="http://localhost:8095/api"
    FRONT_URL="http://localhost:8091"
elif [ "$TARGET_ENV_NAME" == "dockerinternal" ]; then
    TARGET_DOCKER_COMPOSE_FILE="docker-compose.yml"
    API_URL="http://host.docker.internal:8080/api"
    FRONT_URL="http://host.docker.internal:8000"
fi

TARGET_ENV_FILE=".env.docker"
TARGET_NODE_APP_ENV_FILE=".env.nodeapp"
echo "" >> $TARGET_ENV_FILE
echo "JWT_SECURITY_PASSPHRASE=$JWT_TOKEN_KEY" >> $TARGET_ENV_FILE
echo "REDIS_HOST=$DOCKER_CONTAINER_NAME-redis" >> $TARGET_ENV_FILE
echo "APP_NAME=$DOCKER_CONTAINER_NAME" >> $TARGET_ENV_FILE
echo "API_URL=$API_URL" >> $TARGET_ENV_FILE
echo "FRONT_URL=$FRONT_URL" >> $TARGET_ENV_FILE

rm -rf $TARGET_NODE_APP_ENV_FILE
touch $TARGET_NODE_APP_ENV_FILE
echo "JWT_SECRET_KEY=$JWT_TOKEN_KEY" >> $TARGET_NODE_APP_ENV_FILE

echo "Building docker deployment using docker-compose up -d."

DOCKER_COMPOSE_BIN=$(which docker-compose)

${DOCKER_COMPOSE_BIN} -f ${TARGET_DOCKER_COMPOSE_FILE} --env-file ${TARGET_ENV_FILE} down --remove-orphans
    sleep 5
${DOCKER_COMPOSE_BIN} -f ${TARGET_DOCKER_COMPOSE_FILE} --env-file ${TARGET_ENV_FILE} up -d --build --remove-orphans
