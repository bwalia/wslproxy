# whitefalcon

Whitefalcon is an API Gateway and a CDN, and it fully powered itself via API so that it can be fully configured automatically via pipelines and release mangement.

## Rquirements

Bash

Docker

node > 16

yarn

## Installation

# Run the docker example: to build dev environment
```
sudo ./deploy-to-docker.sh "dev" "whitefalcon" "$JWT_TOKEN" && ./show.sh
```

# To purely build docker image and run locally
```
./build.sh "dev" "whitefalcon"
```

# To bootstrap the docker deployment
```
./bootstrap.sh "dev" "whitefalcon"
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
| `int` | `http://api.int2.whitefalcon.io/` | `Ask administrator` |`WhiteFalcon API :- api.int2.whitefalcon.io` | `80 443`
|          |           |          |`WhiteFalcon Front :- front.int2.whitefalcon.io` | `80 443`
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