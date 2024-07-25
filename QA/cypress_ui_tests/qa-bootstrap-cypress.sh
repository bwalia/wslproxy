#!/bin/bash

set -x

LOGIN_EMAIL=$1
LOGIN_PASSWORD=$2
TARGET_ENV=$3
JWT_TOKEN_KEY=$4

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
echo "CYPRESS_LOGIN_EMAIL=$LOGIN_EMAIL" >> /tmp/$ENV_FILE
echo "CYPRESS_LOGIN_PASSWORD=$LOGIN_PASSWORD" >> /tmp/$ENV_FILE
echo "CYPRESS_TARGET_ENV=$TARGET_ENV" >> /tmp/$ENV_FILE
echo "CYPRESS_JWT_TOKEN_KEY=$JWT_TOKEN_KEY" >> /tmp/$ENV_FILE
echo "CYPRESS_BASE_PUB_URL=$BASE_URL" >> /tmp/$ENV_FILE
echo "CYPRESS_FRONTEND_URL=$FRONTEND_URL" >> /tmp/$ENV_FILE
echo "CYPRESS_NODEAPP_ORIGIN_HOST=$NODEAPP_ORIGIN_HOST" >> /tmp/$ENV_FILE
echo "CYPRESS_SERVER_NAME=$SERVER_NAME" >> /tmp/$ENV_FILE
echo "CYPRESS_TARGET_PLATFORM=$TARGET_PLATFORM" >> /tmp/$ENV_FILE

echo "" >> /tmp/$ENV_FILE

mv /tmp/$ENV_FILE .env
cat .env
docker compose -f qa-docker-compose-cypress.yml up cypress-chrome
docker compose -f qa-docker-compose-cypress.yml up cypress-firefox
docker compose -f qa-docker-compose-cypress.yml up cypress-electron