#!/bin/bash

set -x

LOGIN_EMAIL=$1
LOGIN_PASSWORD=$2
TARGET_ENV=$3
JWT_TOKEN_KEY=$4
BROWSER=${5:-chrome}  # Default to 'chrome' if not provided

# Default to dev environment
if [ "$TARGET_ENV" = "dev" ] || [ -z "$TARGET_ENV" ]; then
    BASE_URL="https://dev-our.wslproxy.com"
    FRONTEND_URL="https://dev-frontend.wslproxy.com"
    NODEAPP_ORIGIN_HOST=""
    SERVER_NAME="dev-frontend.wslproxy.com"
    TARGET_PLATFORM="DOCKER"
    ENV_FILE=".env_cypress_dev"
elif [ "$TARGET_ENV" = "int" ]; then
    BASE_URL="https://api-int.wslproxy.com"
    FRONTEND_URL="https://int.wslproxy.com"
    NODEAPP_ORIGIN_HOST="10.43.140.53:3009"
    SERVER_NAME="int.wslproxy.com"
    TARGET_PLATFORM="DOCKER"
    ENV_FILE=".env_cypress_int"
elif [ "$TARGET_ENV" = "test" ]; then
    BASE_URL="https://api-test.wslproxy.com"
    FRONTEND_URL="https://frontdoor-test.wslproxy.com"
    NODEAPP_ORIGIN_HOST=""
    SERVER_NAME="frontdoor-test.wslproxy.com"
    TARGET_PLATFORM="DOCKER"
    ENV_FILE=".env_cypress_test"
elif [ "$TARGET_ENV" = "acc" ]; then
    BASE_URL="https://api-acc.wslproxy.com"
    FRONTEND_URL="https://frontdoor-acc.wslproxy.com"
    NODEAPP_ORIGIN_HOST=""
    SERVER_NAME="frontdoor-acc.wslproxy.com"
    TARGET_PLATFORM="DOCKER"
    ENV_FILE=".env_cypress_acc"
elif [ "$TARGET_ENV" = "dockerinternal" ]; then
    BASE_URL="http://host.docker.internal:4000"
    FRONTEND_URL="http://host.docker.internal:8000"
    NODEAPP_ORIGIN_HOST="172.177.0.10:3009"
    SERVER_NAME="host.docker.internal"
    TARGET_PLATFORM="docker"
    ENV_FILE=".env_cypress_docker_internal"
else
    echo "Unsupported TARGET_ENV: $TARGET_ENV"
    exit 1
fi

# Create .env file
rm -f .env
rm -f /tmp/$ENV_FILE
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

# Run tests based on browser selection
if [ "$BROWSER" = "chrome" ]; then
    echo "Running Cypress tests on Chrome only..."
    docker compose -f qa-docker-compose-cypress.yml up cypress-chrome
elif [ "$BROWSER" = "firefox" ]; then
    echo "Running Cypress tests on Firefox only..."
    docker compose -f qa-docker-compose-cypress.yml up cypress-firefox
elif [ "$BROWSER" = "electron" ]; then
    echo "Running Cypress tests on Electron only..."
    docker compose -f qa-docker-compose-cypress.yml up cypress-electron
else
    echo "Running Cypress tests on all browsers (Chrome, Firefox, Electron)..."
    docker compose -f qa-docker-compose-cypress.yml up cypress-chrome
    docker compose -f qa-docker-compose-cypress.yml up cypress-firefox
    docker compose -f qa-docker-compose-cypress.yml up cypress-electron
fi
