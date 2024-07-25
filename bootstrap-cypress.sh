#!/bin/bash

set -x

USERNAME="$1"
PASSWD="$2"
TARGET_ENV="$3"

if [ "$TARGET_ENV" = "int" ]; then
    BASE_URL="https://api.int.diycdn.org"
    FRONTEND_URL="https://front.int.diycdn.org"
    NODEAPP_ORIGIN_HOST="10.43.140.53:3009"
    SERVER_NAME="front.int.diycdn.org"
    TARGET_PLATFORM="kubernetes"
    ENV_FILE=".env_cypress_int"
fi
if [ "$TARGET_ENV" = "dockerinternal" ]; then
    BASE_URL="http://host.docker.internal:8081"
    FRONTEND_URL="http://host.docker.internal:8000"
    NODEAPP_ORIGIN_HOST="172.177.0.10:3009"
    SERVER_NAME="host.docker.internal"
    TARGET_PLATFORM="docker"
    ENV_FILE=".env_cypress_docker_internal"
fi
rm -Rf .env
rm -Rf /tmp/$ENV_FILE
echo "" > /tmp/$ENV_FILE
sleep 2
echo "CYPRESS_LOGIN_EMAIL=$USERNAME" >> /tmp/$ENV_FILE
echo "CYPRESS_LOGIN_PASSWORD=$PASSWD" >> /tmp/$ENV_FILE
echo "CYPRESS_TARGET_ENV=$TARGET_ENV" >> /tmp/$ENV_FILE
echo "CYPRESS_BASE_PUB_URL=$BASE_URL" >> /tmp/$ENV_FILE
echo "CYPRESS_FRONTEND_URL=$FRONTEND_URL" >> /tmp/$ENV_FILE
echo "CYPRESS_NODEAPP_ORIGIN_HOST=$NODEAPP_ORIGIN_HOST" >> /tmp/$ENV_FILE
echo "CYPRESS_SERVER_NAME=$SERVER_NAME" >> /tmp/$ENV_FILE
echo "CYPRESS_TARGET_PLATFORM=$TARGET_PLATFORM" >> /tmp/$ENV_FILE

echo "" >> /tmp/$ENV_FILE

mv /tmp/$ENV_FILE .env
cat .env
docker compose -f docker-compose-cypress.yml up
