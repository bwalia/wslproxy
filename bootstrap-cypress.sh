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
echo "" >> /tmp/.env_cypress

# mv docker-compose-cypress.yml /tmp/docker-compose-cypress.yml
# mv cypress /tmp/cypress
mv /tmp/.env_cypress .env
# mv /tmp/docker-compose-cypress.yml docker-compose-cypress.yml
# mv /tmp/cypress cypress
# ls -al
docker compose -f docker-compose-cypress.yml up
