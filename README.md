# whitefalcon

Whitefalcon is an API Gateway and a CDN, and it fully powered itself via API so that it can be fully configured automatically via pipelines and release mangement.

## Dev environment Rquirements

Bash

Docker

node > 16

yarn

## Installation using Docker

# Run the docker example: to build dev environment
```
sudo ./deploy-to-docker.sh "dev" "whitefalcon" "$JWT_TOKEN" && ./show.sh
```

# To purely build docker image and run locally
```
./build.sh "dev" "whitefalcon" "$JWT_TOKEN"
```

# To bootstrap the docker deployment
```
./bootstrap.sh "dev" "whitefalcon" "$JWT_TOKEN" "DOCKER"

```
# Deployment onto to the Kubernates
NOTE: MAKE SURE YOU HAVE KUBESEAL IN YOUR SYSTEM
1. Create a .env file with following details:
```
VITE_API_URL=https://YOUR-DOMAIN/api
VITE_FRONT_URL=https://YOUR-FRONT-DOMAIN
VITE_NGINX_CONFIG_DIR=/opt/nginx/
VITE_APP_NAME=YOUR_APP_NAME
VITE_APP_DISPLAY_NAME="YOUR APP NAME TO DISPLAY"
VITE_APP_VERSION: 1.0.0
VITE_DEPLOYMENT_TIME=20231206025957
VITE_APP_BUILD_NUMBER=025957
VITE_JWT_SECURITY_PASSPHRASE=YOUR-JWT-TOKEN
VITE_TARGET_PLATFORM=KUBERNATES
```
2. After creating .env you need to encode this file to base64.
3. Create a new file with name api-secrets.yaml with following details:
```
apiVersion: v1
kind: Secret
metadata:
  name: wf-api-secret-<NAMESPACE>
  namespace: <NAMESPACE>
data:
  env_file: <BASE64 ENCODED ENV FILE>
```
4. Create one more secret file for front door with name front-secrets.yaml and add this:
```
apiVersion: v1
kind: Secret
metadata:
  name: wf-front-secret-<NAMESPACE>
  namespace: <NAMESPACE>
data:
  env_file: <BASE64 ENCODED ENV FILE>
```
5. Now, Run this command to generate the sealed-secrets
```
kubeseal --format=yaml < api-secrets.yaml > api-sealed-secret.yaml
kubeseal --format=yaml < front-secrets.yaml > front-sealed-secret.yaml
```
6. Open the api-sealed-secret.yaml and front-sealed-secret.yaml files copy the env_file: encrypted data.
7. Put that encrypted data into the k3s values files under the 'secure_env_file:'.
8. After the secrets, you also need to update some following secrets in k3s api and front values file:
```
# NOTE: This is example when you are running kubernates clusters on local, For production you can put your domains of api and front door.

api_url: http://wf-api-svc-<NAMESPACE>.<NAMESPACE>.svc.cluster.local/api
front_url: http://wf-front-svc-<NAMESPACE>.<NAMESPACE>.svc.cluster.local
```
9. After updating env secrets, now you have to run these helm commands to run api-gateway on your kubernates:
```
helm upgrade -i whitefalcon-api-<NAMESPACE> ./devops/helm-charts/whitefalcon/ -f devops/helm-charts/whitefalcon/values-<NAMESPACE>-api-<TARGET_CLUSTER>.yaml --set TARGET_ENV=<NAMESPACE> --namespace <NAMESPACE> --create-namespace
helm upgrade -i whitefalcon-front-<NAMESPACE> ./devops/helm-charts/whitefalcon/ -f devops/helm-charts/whitefalcon/values-<NAMESPACE>-front-<TARGET_CLUSTER>.yaml --set TARGET_ENV=<NAMESPACE> --namespace <NAMESPACE> --create-namespace
helm upgrade -i whitefalcon-nodeapp ./devops/helm-charts/node-app/ -f devops/helm-charts/node-app/values-<TARGET_CLUSTER>.yaml
```

10. Disaster Recovery
```
# NOTE: The nginx openresty configuration is backed on to S3 using kubernetes cronjob manifests. See online DR process documentation for more information.
```

## Usage

If you want to change anything in the react-admin then you need to run the 
```
yarn build
```
on your local system. It will automatically sync the build changes with the docker.

## List of the environments:-

| Environment | Link     | Credentials     |  IP addresses       |  Ports |
| :-------- | :------- | :--------------- |:---------------- | :------- |
| `dev` | `http://localhost:8081/` | `Ask administrator` |  `WhiteFalcon API :- localhost(127.0.0.1) `  | ` 8081->8080`
|          |           |          |`WhiteFalcon Front :- localhost(127.0.0.1)` | `8000->80`
|          |           |          |`Docker nodeapp :-localhost(127.0.0.1) -> host.docker.internal if using extra_hosts: - "host.docker.internal:host-gateway" in docker or docker compose` | `3009->3009`
| `int` | `http://api.int.whitefalcon.io/` | `Ask administrator` |`WhiteFalcon API :- api.int.whitefalcon.io` | `80 443`
|          |           |          |`WhiteFalcon Front :- front.int.whitefalcon.io` | `80 443`
|          |           |          |`Node-app :-     ` |  `3009->3009`
|   | `http://api.int6.whitefalcon.io/` | `Ask administrator` |`WhiteFalcon API :- api.int6.whitefalcon.io` | `80 443`
|          |           |          |`WhiteFalcon Front :- front.int6.whitefalcon.io` | `80 443`
|          |           |          |`Node-app :- 	 ` |  `3009->3009`
|  | `http://api.int10.whitefalcon.io/` | `Ask administrator` |`WhiteFalcon API :- api.int10.whitefalcon.io` | `80 443`
|          |           |          |`WhiteFalcon Front :- front.int10.whitefalcon.io` | `80 443`
|          |           |          |`Node-app :-     ` |  `3009->3009`
| `test` | `http://api.test2.whitefalcon.io/` | `Ask administrator` |`WhiteFalcon API :- api.test2.whitefalcon.io` | `80 443`
|          |           |          |`WhiteFalcon Front :- front.test2.whitefalcon.io` | `80 443`
|          |           |          |`Node-app :-      ` |  `3009->3009`
|     | `http://api.test6.whitefalcon.io/` | `Ask administrator` |`WhiteFalcon API :- api.test6.whitefalcon.io` | `80 443`
|          |           |          |`WhiteFalcon Front :- front.test6.whitefalcon.io` | `80 443`
|          |           |          |`Node-app :-      	` |  `3009->3009`