#!/bin/bash

set -x

TARGET_ENV=$1

if [ -z "$2" ]; then
   echo "Secret env file is not provided"
   exit -1
else
   echo "Secret env file is provided ok"
fi

SECRET_ENV_FILE_PATH=$2

if [ -f "$SECRET_ENV_FILE_PATH" ]
then
    echo "$SECRET_ENV_FILE_PATH found."
else
    echo "$SECRET_ENV_FILE_PATH not found."
    exit -1
fi

SECRETS_API_SEED_TMPL_FILE_PATH=$3

if [ -f "$SECRETS_API_SEED_TMPL_FILE_PATH" ]
then
    echo "$SECRETS_API_SEED_TMPL_FILE_PATH found."
else
    echo "$SECRETS_API_SEED_TMPL_FILE_PATH not found."
    exit -1
fi

SECRETS_FRONT_SEED_TMPL_FILE_PATH=$4

if [ -f "$SECRETS_FRONT_SEED_TMPL_FILE_PATH" ]
then
    echo "$SECRETS_FRONT_SEED_TMPL_FILE_PATH found."
else
    echo "$SECRETS_FRONT_SEED_TMPL_FILE_PATH not found."
    exit -1
fi


VALUES_API_SEED_TMPL_FILE_PATH=$5

if [ -f "$VALUES_API_SEED_TMPL_FILE_PATH" ]
then
    echo "$VALUES_API_SEED_TMPL_FILE_PATH found."
else
    echo "$VALUES_API_SEED_TMPL_FILE_PATH not found."
    exit -1
fi


VALUES_FRONT_SEED_TMPL_FILE_PATH=$6

if [ -f "$VALUES_FRONT_SEED_TMPL_FILE_PATH" ]
then
    echo "$VALUES_FRONT_SEED_TMPL_FILE_PATH found."
else
    echo "$VALUES_FRONT_SEED_TMPL_FILE_PATH not found."
    exit -1
fi


MICROSERVICE_TYPE_INSTALL=$7

if [ -f "$MICROSERVICE_TYPE_INSTALL" ]
then
    echo "$MICROSERVICE_TYPE_INSTALL found."
else
MICROSERVICE_TYPE_INSTALL="both"
fi

which kubeseal>/dev/null || echo "Kubeseal is not installed";

echo "Generating Kubesealed secrets for env...$SECRET_ENV_FILE_PATH"

#generate secret file from seed template
if [[ -e "$SECRET_ENV_FILE_PATH" ]]; then
    # 
    echo "The $SECRET_ENV_FILE_PATH file exists."
        # Encode the contents of the .env file to base64
    encoded_content=$(cat "$SECRET_ENV_FILE_PATH" | base64)

    awk -v encoded_content="$encoded_content" '/env_file:/ {$2=encoded_content} 1' "$SECRETS_API_SEED_TMPL_FILE_PATH" > temp_secret_api.yaml
    #awk -v replacement_value="int" '{ gsub(/__target_environment_ref__/, replacement_value) } 1' /tmp/temp.yaml > /tmp/temp.yaml
    #cat /tmp/temp.yaml | awk -v srch=__target_environment_ref__ -v repl=int '{ sub(srch,repl,$0); print $0 }' > /tmp/temp.yaml
    awk -v replacement_value="$TARGET_ENV" '{ gsub(/__target_environment_ref__/, replacement_value) } 1' temp_secret_api.yaml > temp_secrets_api_0.yaml
    awk -v replacement_value="  env_file" '{ gsub(/env_file/, replacement_value) } 1' temp_secrets_api_0.yaml > temp_secrets_api_1.yaml

    awk -v encoded_content="$encoded_content" '/env_file:/ {$2=encoded_content} 1' "$SECRETS_FRONT_SEED_TMPL_FILE_PATH" > temp_secret_front.yaml
    #awk -v replacement_value="int" '{ gsub(/__target_environment_ref__/, replacement_value) } 1' /tmp/temp.yaml > /tmp/temp.yaml
    #cat /tmp/temp.yaml | awk -v srch=__target_environment_ref__ -v repl=int '{ sub(srch,repl,$0); print $0 }' > /tmp/temp.yaml
    replacement_value=$TARGET_ENV
    awk -v replacement_value="$TARGET_ENV" '{ gsub(/__target_environment_ref__/, replacement_value) } 1' temp_secret_front.yaml > temp_secrets_front_0.yaml
    awk -v replacement_value="  env_file" '{ gsub(/env_file/, replacement_value) } 1' temp_secrets_front_0.yaml > temp_secrets_front_1.yaml

else
    echo "The secret seed template file does not exist. Please add the secret seed template file"
    exit
fi




#kubeseal --fetch-cert > /tmp/cert.pem
#--cert /tmp/cert.pem #--scope cluster-wide 
kubeseal --format yaml <temp_secrets_api_1.yaml> secret-api-env-file-sealed.yaml
kubeseal --format yaml <temp_secrets_front_1.yaml> secret-front-env-file-sealed.yaml
#cat secret-api-env-file-sealed.yaml

SEALED_SECRET_ENV_FILE_CONTENT=$(yq eval '.spec.encryptedData.env_file' secret-api-env-file-sealed.yaml)
SEALED_SECRET2_ENV_FILE_CONTENT=$(yq eval '.spec.encryptedData.env_file' secret-front-env-file-sealed.yaml)
#echo $SEALED_SECRET_ENV_FILE_CONTENT

#VALUES_API_SEED_TMPL_FILE_PATH="/tmp/sealed-secret-tmp.yaml"
#VALUES_API_SEED_TMPL_FILE_PATH="/Users/balinderwalia/Documents/Work/Tenthmatrix_Ltd/whitefalcon/devops/helm-charts/whitefalcon/values-api-seed-template.yaml"

if [[ -n "$SEALED_SECRET_ENV_FILE_CONTENT" && -n "$SEALED_SECRET2_ENV_FILE_CONTENT" ]]; then
    awk -v encoded_content="$SEALED_SECRET_ENV_FILE_CONTENT" '/secure_env_file:/ {$2=encoded_content} 1' "$VALUES_API_SEED_TMPL_FILE_PATH" > temp_secret_api.yaml
    awk -v encoded_content="$SEALED_SECRET2_ENV_FILE_CONTENT" '/secure_env_file:/ {$2=encoded_content} 1' "$VALUES_FRONT_SEED_TMPL_FILE_PATH" > temp_secret_front.yaml
    #awk -v replacement_value="int" '{ gsub(/__target_environment_ref__/, replacement_value) } 1' /tmp/temp.yaml > /tmp/temp.yaml
    #cat /tmp/temp.yaml | awk -v srch=__target_environment_ref__ -v repl=int '{ sub(srch,repl,$0); print $0 }' > /tmp/temp.yaml

if [ "$MICROSERVICE_TYPE_INSTALL" == "api" ]; then
    awk -v replacement_value="$TARGET_ENV" '{ gsub(/__target_environment_ref__/, replacement_value) } 1' temp_secret_api.yaml > values-$TARGET_ENV-api-rancher-desktop.yaml
    mv values-$TARGET_ENV-api-rancher-desktop.yaml devops/helm-charts/whitefalcon/values-dev-api-rancher-desktop.yaml

elif [ "$MICROSERVICE_TYPE_INSTALL" == "front" ]; then
    awk -v replacement_value="$TARGET_ENV" '{ gsub(/__target_environment_ref__/, replacement_value) } 1' temp_secret_front.yaml > values-$TARGET_ENV-front-rancher-desktop.yaml
    mv values-$TARGET_ENV-front-rancher-desktop.yaml devops/helm-charts/whitefalcon/values-dev-front-rancher-desktop.yaml
else
    echo "Both microservices are being installed"
    awk -v replacement_value="$TARGET_ENV" '{ gsub(/__target_environment_ref__/, replacement_value) } 1' temp_secret_api.yaml > values-$TARGET_ENV-api-rancher-desktop.yaml
    mv values-$TARGET_ENV-api-rancher-desktop.yaml devops/helm-charts/whitefalcon/values-dev-api-rancher-desktop.yaml
    awk -v replacement_value="$TARGET_ENV" '{ gsub(/__target_environment_ref__/, replacement_value) } 1' temp_secret_front.yaml > values-$TARGET_ENV-front-rancher-desktop.yaml
    mv values-$TARGET_ENV-front-rancher-desktop.yaml devops/helm-charts/whitefalcon/values-dev-front-rancher-desktop.yaml
fi
    stat devops/helm-charts/whitefalcon/values-dev-api-rancher-desktop.yaml
    stat devops/helm-charts/whitefalcon/values-dev-front-rancher-desktop.yaml
#    echo "Encoded .env file and saved the result in $VALUES_API_SEED_TMPL_FILE_PATH."
else
    echo "The .env file does not exist. Please add the .env file"
    exit
fi

echo "Deploying to the currently selected kubernetes cluster"
# Init kubeconfig for the cluster
HELM_CMD="helm"
KUBECTL_CMD="kubectl"

$HELM_CMD upgrade -i node-app ./devops/helm-charts/node-app/ -f devops/helm-charts/node-app/values-rancher-desktop.yaml
$KUBECTL_CMD rollout restart deployment/node-app
$KUBECTL_CMD rollout history deployment/node-app

if [ "$MICROSERVICE_TYPE_INSTALL" == "both" ]; then
   $HELM_CMD upgrade -i whitefalcon-api-dev ./devops/helm-charts/whitefalcon/ -f devops/helm-charts/whitefalcon/values-dev-api-rancher-desktop.yaml --set TARGET_ENV=dev --namespace dev --create-namespace
   $KUBECTL_CMD rollout restart deployment/wf-api-dev -n dev
   $KUBECTL_CMD rollout history deployment/wf-api-dev -n dev
   $HELM_CMD upgrade -i whitefalcon-front-dev ./devops/helm-charts/whitefalcon/ -f devops/helm-charts/whitefalcon/values-dev-front-rancher-desktop.yaml --set TARGET_ENV=dev --namespace dev --create-namespace
   $KUBECTL_CMD rollout restart deployment/wf-front-dev -n dev
   $KUBECTL_CMD rollout history deployment/wf-front-dev -n dev
elif [ "$MICROSERVICE_TYPE_INSTALL" == "api" ]; then
   $HELM_CMD upgrade -i whitefalcon-api-dev ./devops/helm-charts/whitefalcon/ -f devops/helm-charts/whitefalcon/values-dev-api-rancher-desktop.yaml --set TARGET_ENV=dev --namespace dev --create-namespace
   $KUBECTL_CMD rollout restart deployment/wf-api-dev -n dev
   $KUBECTL_CMD rollout history deployment/wf-api-dev -n dev
elif [ "$MICROSERVICE_TYPE_INSTALL" == "front" ]; then
   $HELM_CMD upgrade -i whitefalcon-front-dev ./devops/helm-charts/whitefalcon/ -f devops/helm-charts/whitefalcon/values-dev-front-rancher-desktop.yaml --set TARGET_ENV=dev --namespace dev --create-namespace
   $KUBECTL_CMD rollout restart deployment/wf-front-dev -n dev
   $KUBECTL_CMD rollout history deployment/wf-front-dev -n dev
fi

sleep 30
$KUBECTL_CMD get deploy,svc,pods,ing -n dev




