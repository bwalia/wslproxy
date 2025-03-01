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

# Run the docker example on windows: to build dev environment (make sure you have git bash installed)
```
bash ./deploy-to-docker-windows.sh "dev" "whitefalcon" "$JWT_TOKEN"
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
MINIO_ENDPOINT=<MINIO_ENDPOINT>
MINIO_ACCESS_KEY=<MINIO_ACCESS_KEY>
MINIO_SECRET_KEY=<MINIO_SECRET_KEY>
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
8. Along with .env you will also need to add a settings.json file for backend variables. Here is the sample of settings.json:
```
{
  "instance_id": "your-intance-id",
  "instance_name": "Name for Intance",
  "instance_hash": "intstance hash (Sh1)",
  "serial_number": "serial number for the intance",
    "roles": [
      "release_manager",
      "admin",
      "read_only",
      "read_write"
    ],
    "env_vars": {
      "FRONT_URL": "https://YOUR-FRONT-DOMAIN",
      "JWT_SECURITY_PASSPHRASE": "<YOUR-JWT-TOKEN>",
      "REDIS_HOST": "<REDIS_HOST>",
      "HOSTNAME": "<HOST_NAME>",
      "STACK": "Lua 5.1",
      "APP_NAME": "<APP_NAME>",
      "NGINX_CONFIG_DIR": "<Config directory where you want to save your configurations>",
      "REDIS_PORT": <Redis Port>,
      "API_PAGE_SIZE": 100,
      "VITE_DEPLOYMENT_TIME": "<ADD TIMESTAMP>",
      "CONTROL_PLANE_API_URL": "<Controlplane URL from where you want to pull the data>",
      "VERSION": "1.0",
      "API_URL": "<API_URL>"
    },
    "env_profile": "prod",
    "instance_locked": "true",
    "ip2location_path": "<ADD IP2LOCATION-LITE-DB11.IPV6.BIN file Path>",
    "dns_resolver": {
      "nameservers": {
        "primary": "8.8.8.8",
        "secondary": "8.8.4.4",
        "port": "53"
      }
    },
    "super_user": {
      "username": "<username>",
      "email": "<email for login into the gateway>",
      "password": "<Password for gateway must be SHA256>"
    },
    "storage_type": "disk",
    "redis_host": "<REDIS_HOST>",
    "redis_port": "<REDIS_PORT>",
    "consul": {
      "dns_server_host": "<Consul DNS Resolver host>",
      "dns_server_port": <Consule DNS Resolver Port>
    },
    "nginx": {
      "default": {
        "no_server": "PCFET0NUWVBFIGh0bWw+CjxodG1sPgo8aGVhZD4KICA8dGl0bGU+Tm8gUnVsZXM8L3RpdGxlPgogIDxzdHlsZT4KICAgIGJvZHkgewogICAgICBmb250LWZhbWlseTogQXJpYWwsIHNhbnMtc2VyaWY7CiAgICAgIGJhY2tncm91bmQtY29sb3I6ICNmNGY0ZjQ7CiAgICAgIG1hcmdpbjogMDsKICAgICAgcGFkZGluZzogMDsKICAgICAgZGlzcGxheTogZmxleDsKICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjsKICAgICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7CiAgICAgIGhlaWdodDogMTAwdmg7CiAgICB9CiAgICAKICAgIC5jb250YWluZXIgewogICAgICBtYXgtd2lkdGg6IDQwMHB4OwogICAgICBwYWRkaW5nOiA0MHB4OwogICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjZmZmOwogICAgICBib3gtc2hhZG93OiAwIDAgMTBweCByZ2JhKDAsIDAsIDAsIDAuMSk7CiAgICAgIHRleHQtYWxpZ246IGNlbnRlcjsKICAgIH0KICAgIAogICAgaDEgewogICAgICBmb250LXNpemU6IDI0cHg7CiAgICAgIG1hcmdpbi1ib3R0b206IDIwcHg7CiAgICAgIGNvbG9yOiAjMzMzOwogICAgfQogICAgCiAgICBwIHsKICAgICAgZm9udC1zaXplOiAxOHB4OwogICAgICBjb2xvcjogIzY2NjsKICAgICAgbWFyZ2luLWJvdHRvbTogMzBweDsKICAgIH0KICAgIAogICAgLmJ0biB7CiAgICAgIGRpc3BsYXk6IGlubGluZS1ibG9jazsKICAgICAgcGFkZGluZzogMTBweCAyMHB4OwogICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjMDA3YmZmOwogICAgICBjb2xvcjogI2ZmZjsKICAgICAgZm9udC1zaXplOiAxNnB4OwogICAgICB0ZXh0LWRlY29yYXRpb246IG5vbmU7CiAgICAgIGJvcmRlci1yYWRpdXM6IDRweDsKICAgICAgdHJhbnNpdGlvbjogYmFja2dyb3VuZC1jb2xvciAwLjNzIGVhc2U7CiAgICB9CiAgICAKICAgIC5idG46aG92ZXIgewogICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjMDA1NmIzOwogICAgfQogIDwvc3R5bGU+CjwvaGVhZD4KPGJvZHk+CiAgPGRpdiBjbGFzcz0iY29udGFpbmVyIj4KICAgIDxoMT5ObyBOZ2lueCBTZXJ2ZXIgQ29uZmlnIGZvdW5kITwvaDE+CiAgICA8cD5QbGVhc2UgYXNrIFdlYk9wcyB0byBDb25maWd1cmUgaXQuPC9wPgogICAgPGEgaHJlZj0iIyIgY2xhc3M9ImJ0biI+Q29udGFjdCBBZG1pbmlzdHJhdG9yPC9hPgogIDwvZGl2Pgo8L2JvZHk+CjwvaHRtbD4K",
        "conf_mismatch": "PCFET0NUWVBFIGh0bWw+CjxodG1sPgo8aGVhZD4KICA8dGl0bGU+Tm8gUnVsZXM8L3RpdGxlPgogIDxzdHlsZT4KICAgIGJvZHkgewogICAgICBmb250LWZhbWlseTogQXJpYWwsIHNhbnMtc2VyaWY7CiAgICAgIGJhY2tncm91bmQtY29sb3I6ICNmNGY0ZjQ7CiAgICAgIG1hcmdpbjogMDsKICAgICAgcGFkZGluZzogMDsKICAgICAgZGlzcGxheTogZmxleDsKICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjsKICAgICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7CiAgICAgIGhlaWdodDogMTAwdmg7CiAgICB9CiAgICAKICAgIC5jb250YWluZXIgewogICAgICBtYXgtd2lkdGg6IDQwMHB4OwogICAgICBwYWRkaW5nOiA0MHB4OwogICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjZmZmOwogICAgICBib3gtc2hhZG93OiAwIDAgMTBweCByZ2JhKDAsIDAsIDAsIDAuMSk7CiAgICAgIHRleHQtYWxpZ246IGNlbnRlcjsKICAgIH0KICAgIAogICAgaDEgewogICAgICBmb250LXNpemU6IDI0cHg7CiAgICAgIG1hcmdpbi1ib3R0b206IDIwcHg7CiAgICAgIGNvbG9yOiAjMzMzOwogICAgfQogICAgCiAgICBwIHsKICAgICAgZm9udC1zaXplOiAxOHB4OwogICAgICBjb2xvcjogIzY2NjsKICAgICAgbWFyZ2luLWJvdHRvbTogMzBweDsKICAgIH0KICAgIAogICAgLmJ0biB7CiAgICAgIGRpc3BsYXk6IGlubGluZS1ibG9jazsKICAgICAgcGFkZGluZzogMTBweCAyMHB4OwogICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjMDA3YmZmOwogICAgICBjb2xvcjogI2ZmZjsKICAgICAgZm9udC1zaXplOiAxNnB4OwogICAgICB0ZXh0LWRlY29yYXRpb246IG5vbmU7CiAgICAgIGJvcmRlci1yYWRpdXM6IDRweDsKICAgICAgdHJhbnNpdGlvbjogYmFja2dyb3VuZC1jb2xvciAwLjNzIGVhc2U7CiAgICB9CiAgICAKICAgIC5idG46aG92ZXIgewogICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjMDA1NmIzOwogICAgfQogIDwvc3R5bGU+CjwvaGVhZD4KPGJvZHk+CiAgPGRpdiBjbGFzcz0iY29udGFpbmVyIj4KICAgIDxoMT5Db25maWd1cmF0aW9uIG5vdCBtYXRjaCE8L2gxPgogICAgPHA+UGxlYXNlIGNoZWNrIHlvdXIgY29uZmlndXJhdGlvbnMgb3IgYXNrIFdlYk9wcyB0byBDb25maWd1cmUgaXQgcmlnaHQuPC9wPgogICAgPGEgaHJlZj0iIyIgY2xhc3M9ImJ0biI+Q29udGFjdCBBZG1pbmlzdHJhdG9yPC9hPgogIDwvZGl2Pgo8L2JvZHk+CjwvaHRtbD4K",
        "no_rule": "PCFET0NUWVBFIGh0bWw+CjxodG1sPgo8aGVhZD4KICA8dGl0bGU+Tm8gUnVsZXM8L3RpdGxlPgogIDxzdHlsZT4KICAgIGJvZHkgewogICAgICBmb250LWZhbWlseTogQXJpYWwsIHNhbnMtc2VyaWY7CiAgICAgIGJhY2tncm91bmQtY29sb3I6ICNmNGY0ZjQ7CiAgICAgIG1hcmdpbjogMDsKICAgICAgcGFkZGluZzogMDsKICAgICAgZGlzcGxheTogZmxleDsKICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjsKICAgICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7CiAgICAgIGhlaWdodDogMTAwdmg7CiAgICB9CiAgICAKICAgIC5jb250YWluZXIgewogICAgICBtYXgtd2lkdGg6IDQwMHB4OwogICAgICBwYWRkaW5nOiA0MHB4OwogICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjZmZmOwogICAgICBib3gtc2hhZG93OiAwIDAgMTBweCByZ2JhKDAsIDAsIDAsIDAuMSk7CiAgICAgIHRleHQtYWxpZ246IGNlbnRlcjsKICAgIH0KICAgIAogICAgaDEgewogICAgICBmb250LXNpemU6IDI0cHg7CiAgICAgIG1hcmdpbi1ib3R0b206IDIwcHg7CiAgICAgIGNvbG9yOiAjMzMzOwogICAgfQogICAgCiAgICBwIHsKICAgICAgZm9udC1zaXplOiAxOHB4OwogICAgICBjb2xvcjogIzY2NjsKICAgICAgbWFyZ2luLWJvdHRvbTogMzBweDsKICAgIH0KICAgIAogICAgLmJ0biB7CiAgICAgIGRpc3BsYXk6IGlubGluZS1ibG9jazsKICAgICAgcGFkZGluZzogMTBweCAyMHB4OwogICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjMDA3YmZmOwogICAgICBjb2xvcjogI2ZmZjsKICAgICAgZm9udC1zaXplOiAxNnB4OwogICAgICB0ZXh0LWRlY29yYXRpb246IG5vbmU7CiAgICAgIGJvcmRlci1yYWRpdXM6IDRweDsKICAgICAgdHJhbnNpdGlvbjogYmFja2dyb3VuZC1jb2xvciAwLjNzIGVhc2U7CiAgICB9CiAgICAKICAgIC5idG46aG92ZXIgewogICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjMDA1NmIzOwogICAgfQogIDwvc3R5bGU+CjwvaGVhZD4KPGJvZHk+CiAgPGRpdiBjbGFzcz0iY29udGFpbmVyIj4KICAgIDxoMT5Db25maWd1cmF0aW9uIE1pc3NpbmchPC9oMT4KICAgIDxwPlBsZWFzZSBhc2sgV2ViT3BzIHRvIENvbmZpZ3VyZSB0aGlzIEFQSSBHYXRld2F5LjwvcD4KICAgIDxhIGhyZWY9IiMiIGNsYXNzPSJidG4iPkNvbnRhY3QgQWRtaW5pc3RyYXRvcjwvYT4KICA8L2Rpdj4KPC9ib2R5Pgo8L2h0bWw+Cg=="
      },
      "content_type": "text/html"
    }
  }
```
9. After creating settings.json you need to encode this file to base64.
10. Create a new file with name api-setings-secrets.yaml with following details:
```
apiVersion: v1
kind: Secret
metadata:
  name: wf-api-settings-<NAMESPACE>
  namespace: <NAMESPACE>
data:
  env_file: <BASE64 ENCODED ENV FILE>
```
11. Now, Run this command to generate the settings-sealed-secrets
```
kubeseal --format=yaml < api-setings-secrets.yaml > api-settings-sealed-secret.yaml
```
12. Open the api-settings-sealed-secret.yaml file copy the env_file: encrypted data.
13. Put that encrypted data into the k3s values files under the 'settings_sec_env_file:'.

14. After the secrets, you also need to update some following secrets in k3s api and front values file:
```
# NOTE: This is example when you are running kubernates clusters on local, For production you can put your domains of api and front door.

api_url: http://wf-api-svc-<NAMESPACE>.<NAMESPACE>.svc.cluster.local/api
front_url: http://wf-front-svc-<NAMESPACE>.<NAMESPACE>.svc.cluster.local
```
15. After updating env secrets, now you have to run these helm commands to run api-gateway on your kubernates:
```
helm upgrade -i whitefalcon-api-<NAMESPACE> ./devops/helm-charts/whitefalcon/ -f devops/helm-charts/whitefalcon/values-<NAMESPACE>-api-<TARGET_CLUSTER>.yaml --set TARGET_ENV=<NAMESPACE> --namespace <NAMESPACE> --create-namespace
helm upgrade -i whitefalcon-front-<NAMESPACE> ./devops/helm-charts/whitefalcon/ -f devops/helm-charts/whitefalcon/values-<NAMESPACE>-front-<TARGET_CLUSTER>.yaml --set TARGET_ENV=<NAMESPACE> --namespace <NAMESPACE> --create-namespace
helm upgrade -i whitefalcon-nodeapp ./devops/helm-charts/node-app/ -f devops/helm-charts/node-app/values-<TARGET_CLUSTER>.yaml
```

16. Disaster Recovery
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
| `int` | `http://api-int.brahmstra.org/` | `Ask administrator` |`WhiteFalcon API :- api-int.brahmstra.org` | `80 443`
|          |           |          |`WhiteFalcon Front :- front-int.brahmstra.org` | `80 443`
|          |           |          |`Node-app :-     ` |  `3009->3009`
|   | `http://api-int.brahmstra.org/` | `Ask administrator` |`WhiteFalcon API :- api-int.brahmstra.org` | `80 443`
|          |           |          |`WhiteFalcon Front :- frontdoor-int.brahmstra.org` | `80 443`
|          |           |          |`Node-app :- 	 ` |  `3009->3009`
|  | `http://api-int.brahmstra.org/` | `Ask administrator` |`WhiteFalcon API :- api-int.brahmstra.org` | `80 443`
|          |           |          |`WhiteFalcon Front :- frontdoor-int.brahmstra.org` | `80 443`
|          |           |          |`Node-app :-     ` |  `3009->3009`
| `test` | `http://api.test2.brahmstra.org/` | `Ask administrator` |`WhiteFalcon API :- api.test2.brahmstra.org` | `80 443`
|          |           |          |`WhiteFalcon Front :- front.test2.brahmstra.org` | `80 443`
|          |           |          |`Node-app :-      ` |  `3009->3009`
|     | `http://api.test6.brahmstra.org/` | `Ask administrator` |`WhiteFalcon API :- api.test6.brahmstra.org` | `80 443`
|          |           |          |`WhiteFalcon Front :- front.brahmstra.org` | `80 443`
|          |           |          |`Node-app :-      	` |  `3009->3009`
## How to run Ansible for a workflow

ansible-playbook devops/ansible/playbook_openresty.yml -i devops/ansible/hosts -l target_host_ip

##Replace 'playbook_openresty.yml' with the actual playbook
### Replace 'devops/ansible/hosts' with the required host file
### Replace target_host_ip with the target host which you want to run the playbook
