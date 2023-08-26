#!/bin/bash

set -x

if [ -z "$1" ]; then
   echo "Cluster is not provided"
   exit -1
else
   echo "Cluster is provided ok"
fi

echo "Printing $1 cluster pods, services and ingress related to whitefalcon INT, TEST and ACC environments"

HELM_CMD="helm"
KUBECTL_CMD="kubectl"

echo "Deploying to $1 cluster"
# Init kubeconfig for the cluster
HELM_CMD="helm --kubeconfig /home/bwalia/.kube/vpn-$1.yaml"
KUBECTL_CMD="kubectl --kubeconfig /home/bwalia/.kube/vpn-$1.yaml"

$KUBECTL_CMD version
$KUBECTL_CMD cluster-info

$HELM_CMD ls -A | grep whitefalcon
$KUBECTL_CMD get deploy,svc,pods,ing -A | grep whitefalcon
$KUBECTL_CMD get svc -A | grep wf
$KUBECTL_CMD get svc -A | grep node
