#!/bin/bash

clear

DOCKER_CONTAINER_NAME="openresty-alpine"
DOCKER_CONTAINER_NAME="whitefalcon"

docker cp nginx-dev.conf.tmpl ${DOCKER_CONTAINER_NAME}:/usr/local/openresty/nginx/conf/nginx.conf
docker cp response.lua ${DOCKER_CONTAINER_NAME}:/usr/local/openresty/nginx/html/first.lua
docker cp api/ ${DOCKER_CONTAINER_NAME}:/usr/local/openresty/nginx/html/
docker cp data/ ${DOCKER_CONTAINER_NAME}:/usr/local/openresty/nginx/html/
docker cp openresty-admin/src ${DOCKER_CONTAINER_NAME}:/usr/local/openresty/nginx/html/openresty-admin/
docker exec -it ${DOCKER_CONTAINER_NAME} openresty -t 
docker exec -it ${DOCKER_CONTAINER_NAME} openresty -s reload