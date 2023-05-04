#!/bin/bash

set -x

DOCKER_PUBLIC_IMAGE_NAME=bwalia/openresty-alpine
VERSION=latest

docker build -t ${DOCKER_PUBLIC_IMAGE_NAME}:${VERSION} -f Dockerfile .
docker push ${DOCKER_PUBLIC_IMAGE_NAME}:${VERSION}
