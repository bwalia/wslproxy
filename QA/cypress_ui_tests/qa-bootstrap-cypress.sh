#!/bin/bash

set -x

LOGIN_EMAIL=$1
LOGIN_PASSWORD=$2
TARGET_ENV=$3

rm -Rf .env
rm -Rf /tmp/.env_cypress
echo "" > /tmp/.env_cypress
echo "CYPRESS_LOGIN_EMAIL=$LOGIN_EMAIL" >> /tmp/.env_cypress
echo "CYPRESS_LOGIN_PASSWORD=$LOGIN_PASSWORD" >> /tmp/.env_cypress
echo "CYPRESS_TARGET_ENV=$TARGET_ENV" >> /tmp/.env_cypress
if [ "$TARGET_ENV" = "int" ]; then
    BASE_URL="https://api.int2.whitefalcon.io"
    FRONTEND_URL="https://front.int2.whitefalcon.io"
    NODEAPP_ORIGIN_HOST="10.43.140.53:3009"
    SERVER_NAME="front.int2.whitefalcon.io"
    TARGET_PLATFORM="kubernetes"
fi
if [ "$TARGET_ENV" = "local" ]; then
    BASE_URL="http://host.docker.internal:8081"
    FRONTEND_URL="http://host.docker.internal:8000"
    NODEAPP_ORIGIN_HOST="172.177.0.10:3009"
    SERVER_NAME="host.docker.internal"
    TARGET_PLATFORM="docker"
fi
sleep 2
echo "CYPRESS_BASE_PUB_URL=$BASE_URL" >> /tmp/.env_cypress
echo "CYPRESS_FRONTEND_URL=$FRONTEND_URL" >> /tmp/.env_cypress
echo "CYPRESS_NODEAPP_ORIGIN_HOST=$NODEAPP_ORIGIN_HOST" >> /tmp/.env_cypress
echo "CYPRESS_SERVER_NAME=$SERVER_NAME" >> /tmp/.env_cypress
echo "CYPRESS_TARGET_PLATFORM=$TARGET_PLATFORM" >> /tmp/.env_cypress

echo "" >> /tmp/.env_cypress

mv /tmp/.env_cypress .env
cat .env
docker compose -f qa-docker-compose-cypress.yml up --remove-orphans
