#!/bin/bash

clear

DOCKER_CONTAINER_NAME="openresty-alpine"
DOCKER_CONTAINER_NAME="whitefalcon"
APP_ENV="dev"

docker cp nginx-dev.conf.tmpl ${DOCKER_CONTAINER_NAME}:/usr/local/openresty/nginx/conf/nginx.conf
docker exec -it ${DOCKER_CONTAINER_NAME} sed -i "s/{{ .Env.DNS_RESOLVER }}/${DNS_RESOLVER}/g" /usr/local/openresty/nginx/conf/nginx.conf
#docker exec -it ${DOCKER_CONTAINER_NAME} dockerize -template /usr/local/openresty/nginx/conf/nginx.conf:/usr/local/openresty/nginx/conf/nginx.conf

docker cp response.lua ${DOCKER_CONTAINER_NAME}:/usr/local/openresty/nginx/html/first.lua
docker cp api/ ${DOCKER_CONTAINER_NAME}:/usr/local/openresty/nginx/html/
docker cp data/ ${DOCKER_CONTAINER_NAME}:/usr/local/openresty/nginx/html/
docker cp .env.${APP_ENV} ${DOCKER_CONTAINER_NAME}:/usr/local/openresty/nginx/html/openresty-admin/.env
docker cp openresty-admin/src ${DOCKER_CONTAINER_NAME}:/usr/local/openresty/nginx/html/openresty-admin/
docker exec -it ${DOCKER_CONTAINER_NAME} openresty -t 
docker exec -it ${DOCKER_CONTAINER_NAME} openresty -s reload
