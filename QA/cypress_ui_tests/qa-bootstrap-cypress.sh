#!/bin/bash

set -x

USERNAME="$1"
PASSWD="$2"
TARGET_ENV="$3"

rm -Rf .env
rm -Rf /tmp/.env_cypress
echo "" > /tmp/.env_cypress
echo "CYPRESS_LOGIN_EMAIL=$USERNAME" >> /tmp/.env_cypress
echo "CYPRESS_LOGIN_PASSWORD=$PASSWD" >> /tmp/.env_cypress
echo "CYPRESS_TARGET_ENV=$TARGET_ENV" >> /tmp/.env_cypress
if [ "$TARGET_ENV" = "int" ]; then
    echo "CYPRESS_BASE_URL=https://api.int2.whitefalcon.io" >> /tmp/.env_cypress
    echo "CYPRESS_FRONTEND_URL=https://front.int2.whitefalcon.io" >> /tmp/.env_cypress
    echo "CYPRESS_NODEAPP_ORIGIN_HOST=10.43.140.53" >> /tmp/.env_cypress
    echo "CYPRESS_SERVER_NAME=front.int2.whitefalcon.io" >> /tmp/.env_cypress
    echo "CYPRESS_TARGET_PLATFORM=kubernates" >> /tmp/.env_cypress
elif [ "$TARGET_ENV" = "local" ]; then
    echo "CYPRESS_BASE_URL=http://host.docker.internal:8081" >> /tmp/.env_cypress
    echo "CYPRESS_FRONTEND_URL=http://host.docker.internal:8000" >> /tmp/.env_cypress
    echo "CYPRESS_NODEAPP_ORIGIN_HOST=172.177.0.10:3009" >> /tmp/.env_cypress
    echo "CYPRESS_SERVER_NAME=host.docker.internal" >> /tmp/.env_cypress
    echo "CYPRESS_TARGET_PLATFORM=docker" >> /tmp/.env_cypress
fi

echo "" >> /tmp/.env_cypress

# mv docker-compose-cypress.yml /tmp/docker-compose-cypress.yml
# mv cypress /tmp/cypress
mv /tmp/.env_cypress .env
# mv /tmp/docker-compose-cypress.yml docker-compose-cypress.yml
# mv /tmp/cypress cypress
# ls -al
docker-compose -f qa-docker-compose-cypress.yml up --remove-orphans
