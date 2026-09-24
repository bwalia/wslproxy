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
    echo "No docker image name supplied default to wslproxy"
    DOCKER_CONTAINER_NAME="wslproxy"
else
    echo "Docker image name: $2"
    DOCKER_CONTAINER_NAME="$2"
fi
if [ -z "$3" ]
  then
    echo "No JWT token supplied default to wslproxy"
else 
    JWT_TOKEN_KEY="$3"
fi
if [ -z "$4" ]
  then
    echo "No Platform mentioned default to docker"
    TARGET_PLATFORM="DOCKER"
else 
    TARGET_PLATFORM="$4"
fi

if [ -d .env/ ]; then
    rm -rf .env/
fi

if [ -f .env ]; then
    truncate -s 0 .env
else
    touch .env
fi

DATE_GEN_VERSION=$(date +"%Y%m%d%I%M%S")
cp ${TARGET_ENV_FILE} .env
sleep 2
docker exec -i ${DOCKER_CONTAINER_NAME} chmod -R 777 /opt/nginx/data/
docker exec -i ${DOCKER_CONTAINER_NAME} openresty -s reload
echo "Loaded env file content from within the container: .env :"
docker exec -i ${DOCKER_CONTAINER_NAME} cat .env
