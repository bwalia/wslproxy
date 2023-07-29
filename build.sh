#!/bin/bash

set -x
if [ -z "$1" ]; then
   echo "Docker username is not provided"
   exit -1
else
   echo "Docker username is provided ok"
fi
if [ -z "$2" ]; then
   echo "Docker password is not provided"
   exit -1
else
   echo "Docker password is provided ok"
fi

DOCKER_PUBLIC_IMAGE_NAME=bwalia/whitefalcon
VERSION=latest
SOURCE_IMAGE=openresty_alpine

docker image rm ${DOCKER_PUBLIC_IMAGE_NAME}
docker build -t ${DOCKER_PUBLIC_IMAGE_NAME}:${VERSION} -f Dockerfile . --no-cache
docker login -u $1 -p $2
#docker tag whitefalcon-${SOURCE_IMAGE} ${DOCKER_PUBLIC_IMAGE_NAME}:${VERSION}
docker push ${DOCKER_PUBLIC_IMAGE_NAME}:${VERSION}


DOCKER_PUBLIC_IMAGE_NAME=bwalia/node-app
VERSION=latest

docker image rm ${DOCKER_PUBLIC_IMAGE_NAME}
docker build -t ${DOCKER_PUBLIC_IMAGE_NAME}:${VERSION} -f demos-origins/node-app/Dockerfile . --no-cache
docker login -u $1 -p $2
#docker tag whitefalcon-${SOURCE_IMAGE} ${DOCKER_PUBLIC_IMAGE_NAME}:${VERSION}
docker push ${DOCKER_PUBLIC_IMAGE_NAME}:${VERSION}