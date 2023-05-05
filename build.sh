#!/bin/bash

set -x

DOCKER_PUBLIC_IMAGE_NAME=bwalia/whitefalcon
VERSION=latest

docker build -t ${DOCKER_PUBLIC_IMAGE_NAME}:${VERSION} -f Dockerfile .
docker login -u $1 -p $2
docker push ${DOCKER_PUBLIC_IMAGE_NAME}:${VERSION}
