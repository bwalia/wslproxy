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

if [ -z "$3" ]; then
   echo "Env is not provided"
   exit -1
else
   echo "Env is provided ok"
fi

DOCKER_PUBLIC_IMAGE_NAME=bwalia/whitefalcon
VERSION=latest
SOURCE_IMAGE=openresty_alpine

# docker image rm ${DOCKER_PUBLIC_IMAGE_NAME}
# docker build -t ${DOCKER_PUBLIC_IMAGE_NAME}:${VERSION} -f Dockerfile . --no-cache
# docker login -u $1 -p $2
# #docker tag whitefalcon-${SOURCE_IMAGE} ${DOCKER_PUBLIC_IMAGE_NAME}:${VERSION}
# docker push ${DOCKER_PUBLIC_IMAGE_NAME}:${VERSION}

HELM_CMD="helm --kubeconfig $HOME/.kube/vpn-k3s2.yaml"
KUBECTL_CMD="kubectl --kubeconfig $HOME//.kube/vpn-k3s2.yaml"
#KUBECTL_CMD="kubectl --kubeconfig /Users/balinderwalia/.kube/vpn-k3s2.yaml"
$HELM_CMD upgrade -i whitefalcon-api-$3 ./devops/helm-charts/whitefalcon/ -f devops/helm-charts/whitefalcon/values-$3-api-k3s2.yaml --set TARGET_ENV=$3 --namespace $3 --create-namespace
$HELM_CMD upgrade -i whitefalcon-front-$3 ./devops/helm-charts/whitefalcon/ -f devops/helm-charts/whitefalcon/values-$3-front-k3s2.yaml --set TARGET_ENV=$3 --namespace $3 --create-namespace
sleep 30
$KUBECTL_CMD rollout history deployment/whitefalcon-api-$3-api -n $3
$KUBECTL_CMD rollout restart deployment/whitefalcon-api-$3-api -n $3
$KUBECTL_CMD rollout history deployment/whitefalcon-front-$3-front -n $3
$KUBECTL_CMD rollout restart deployment/whitefalcon-front-$3-front -n $3
sleep 120
$KUBECTL_CMD get svc,pods,ing -n $3
