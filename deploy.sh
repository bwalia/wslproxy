#!/bin/bash

set -x
if [ -z "$1" ]; then
   echo "Docker username is not provided"
   exit -1
else
   echo "Docker username is provided ok $1"
fi
if [ -z "$2" ]; then
   echo "Docker password is not provided"
   exit -1
else
   echo "Docker password is provided ok $2"
fi

if [ -z "$3" ]; then
   echo "Cluster is not provided"
   exit -1
else
   echo "Cluster is provided ok $3"
fi

if [ -z "$4" ]; then
   echo "Env is not provided"
   exit -1
else
   echo "Env is provided ok $4"
fi

if [ -z "$5" ]; then
   echo "Build env flag is not provided"
   BUILD_ENV_FLAG="false"
else
   echo "Build env flag is provided $5"
   BUILD_ENV_FLAG=$5
fi

DOCKER_PUBLIC_IMAGE_NAME=bwalia/whitefalcon
VERSION=latest
SOURCE_IMAGE=openresty_alpine

if [ "$BUILD_ENV_FLAG" = "true" ]; then
   docker image rm ${DOCKER_PUBLIC_IMAGE_NAME}
   docker build -t ${DOCKER_PUBLIC_IMAGE_NAME}:${VERSION} -f Dockerfile . --no-cache
   docker login -u $1 -p $2
   #docker tag whitefalcon-${SOURCE_IMAGE} ${DOCKER_PUBLIC_IMAGE_NAME}:${VERSION}
   docker push ${DOCKER_PUBLIC_IMAGE_NAME}:${VERSION}
fi

HELM_CMD="helm --kubeconfig $HOME/.kube/vpn-$3.yaml"
KUBECTL_CMD="kubectl --kubeconfig $HOME/.kube/vpn-$3.yaml"
#KUBECTL_CMD="kubectl --kubeconfig /Users/balinderwalia/.kube/vpn-$3.yaml"
$HELM_CMD upgrade -i whitefalcon-api-$4 ./devops/helm-charts/whitefalcon/ -f devops/helm-charts/whitefalcon/values-$4-api-$3.yaml --set TARGET_ENV=$4 --namespace $4 --create-namespace
$HELM_CMD upgrade -i whitefalcon-front-$4 ./devops/helm-charts/whitefalcon/ -f devops/helm-charts/whitefalcon/values-$4-front-$3.yaml --set TARGET_ENV=$4 --namespace $4 --create-namespace
sleep 30
$KUBECTL_CMD rollout restart deployment/whitefalcon-api-$4-api -n $4
$KUBECTL_CMD rollout history deployment/whitefalcon-api-$4-api -n $4
$KUBECTL_CMD rollout restart deployment/whitefalcon-front-$4-front -n $4
$KUBECTL_CMD rollout history deployment/whitefalcon-front-$4-front -n $4
sleep 120
$KUBECTL_CMD get deploy,svc,pods,ing -n $4
