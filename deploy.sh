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
   echo "Cluster is not provided"
   exit -1
else
   echo "Cluster is provided ok"
fi

if [ -z "$4" ]; then
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

HELM_CMD="helm --kubeconfig $HOME/.kube/vpn-$3.yaml"
KUBECTL_CMD="kubectl --kubeconfig $HOME/.kube/vpn-$3.yaml"
#KUBECTL_CMD="kubectl --kubeconfig /Users/balinderwalia/.kube/vpn-$3.yaml"
$HELM_CMD upgrade -i whitefalcon-api-$4 ./devops/helm-charts/whitefalcon/ -f devops/helm-charts/whitefalcon/values-$4-api-$3.yaml --set TARGET_ENV=$4 --namespace $4 --create-namespace
$HELM_CMD upgrade -i whitefalcon-front-$4 ./devops/helm-charts/whitefalcon/ -f devops/helm-charts/whitefalcon/values-$4-front-$3.yaml --set TARGET_ENV=$4 --namespace $4 --create-namespace
$HELM_CMD upgrade -i node-app ./devops/helm-charts/node-app/ -f devops/helm-charts/node-app/values.yaml

sleep 30
$KUBECTL_CMD rollout restart deployment/wf-api-$4 -n $4
$KUBECTL_CMD rollout history deployment/wf-api-$4 -n $4
$KUBECTL_CMD rollout restart deployment/wf-front-$4 -n $4
$KUBECTL_CMD rollout history deployment/wf-front-$4 -n $4
sleep 120
$KUBECTL_CMD get deploy,svc,pods,ing -n $4
