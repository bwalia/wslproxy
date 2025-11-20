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
   echo "$KUBE_CONFIG" | base64 -d > /home/bwalia/.kube/vpn-k3s2.yaml
fi

if [ -z "$4" ]; then
   echo "Env is not provided"
   exit -1
else
   echo "Env is provided ok"
fi


if [ -z "$5" ]; then
   echo "App type is not provided default (api) will be used"
   APP_TYPE="api"
else
   echo "App type is provided ok"
   APP_TYPE=$5
fi

echo "Deploying to k3s2 cluster"

DOCKER_PUBLIC_IMAGE_NAME=bwalia/wslproxy
VERSION=latest
SOURCE_IMAGE=openresty_alpine

docker image rm ${DOCKER_PUBLIC_IMAGE_NAME}
docker build -t ${DOCKER_PUBLIC_IMAGE_NAME}:${VERSION} -f Dockerfile . --no-cache
docker login -u $1 -p $2
docker tag wslproxy-${SOURCE_IMAGE} ${DOCKER_PUBLIC_IMAGE_NAME}:${VERSION}
docker push ${DOCKER_PUBLIC_IMAGE_NAME}:${VERSION}

HELM_CMD="helm"
KUBECTL_CMD="kubectl"

echo "Deploying to k3s2 cluster"
# Init kubeconfig for the cluster
HELM_CMD="helm --kubeconfig /home/bwalia/.kube/vpn-k3s2.yaml"
KUBECTL_CMD="kubectl --kubeconfig /home/bwalia/.kube/vpn-k3s2.yaml"

$HELM_CMD upgrade -i node-app ./devops/helm-charts/node-app/ -f devops/helm-charts/node-app/values-k3s2.yaml
$KUBECTL_CMD rollout restart deployment/node-app
$KUBECTL_CMD rollout history deployment/node-app

if [ "$APP_TYPE" == "both" ]; then
   $HELM_CMD upgrade -i wslproxy-api-$4 ./devops/helm-charts/wslproxy/ -f devops/helm-charts/wslproxy/values-$4-api-k3s2.yaml --set TARGET_ENV=$4 --namespace $4 --create-namespace
   $KUBECTL_CMD rollout restart deployment/wf-api-$4 -n $4
   $KUBECTL_CMD rollout history deployment/wf-api-$4 -n $4
   $HELM_CMD upgrade -i wslproxy-front-$4 ./devops/helm-charts/wslproxy/ -f devops/helm-charts/wslproxy/values-$4-front-k3s2.yaml --set TARGET_ENV=$4 --namespace $4 --create-namespace
   $KUBECTL_CMD rollout restart deployment/wf-front-$4 -n $4
   $KUBECTL_CMD rollout history deployment/wf-front-$4 -n $4
elif [ "$APP_TYPE" == "api" ]; then
   $HELM_CMD upgrade -i wslproxy-api-$4 ./devops/helm-charts/wslproxy/ -f devops/helm-charts/wslproxy/values-$4-api-k3s2.yaml --set TARGET_ENV=$4 --namespace $4 --create-namespace
   $KUBECTL_CMD rollout restart deployment/wf-api-$4 -n $4
   $KUBECTL_CMD rollout history deployment/wf-api-$4 -n $4
elif [ "$APP_TYPE" == "front" ]; then
   $HELM_CMD upgrade -i wslproxy-front-$4 ./devops/helm-charts/wslproxy/ -f devops/helm-charts/wslproxy/values-$4-front-k3s2.yaml --set TARGET_ENV=$4 --namespace $4 --create-namespace
   $KUBECTL_CMD rollout restart deployment/wf-front-$4 -n $4
   $KUBECTL_CMD rollout history deployment/wf-front-$4 -n $4
fi

sleep 30
$KUBECTL_CMD get deploy,svc,pods,ing -n $4
