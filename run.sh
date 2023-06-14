#!/bin/bash

clear

echo "Usage docker-compose up -d instead."

exit 1

CONTAINER_ID=whitefalcon-api

echo "Stopping old container ${CONTAINER_ID}"
docker container stop ${CONTAINER_ID}

echo "Removing old container ${CONTAINER_ID}"
docker container rm ${CONTAINER_ID}
#docker image rm bwalia/whitefalcon-api

#docker build -t="bwalia/whitefalcon-api" .
#--env-file config/env.list \
#   -v /Users/balinderwalia/Documents/Work/docker/openresty/custom/conf.d:/etc/nginx/conf.d 
docker run \
-d \
--name ${CONTAINER_ID} \
-p 8080:80 bwalia/whitefalcon-api