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
./deploy-to-docker.sh "dev" "whitefalcon" && ./show.sh
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

| Environment | Link     | Credentials                |  Status       |
| :-------- | :------- | :------------------------- | :------------ |
| `dev` | `http://localhost:8081/` | `Ask administrator` |  ![API Test Suite](https://github.com/bwalia/whitefalcon/actions/workflows/whitefalcon-api-test.yml/badge.svg?branch=dixa%2Fqa-checks&event=workflow_dispatch)
| `int` | `http://api.int2.whitefalcon.io/` | `Ask administrator` |![API Test Suite](https://github.com/bwalia/whitefalcon/actions/workflows/whitefalcon-api-test.yml/badge.svg?branch=dixa%2Fqa-checks&event=workflow_dispatch)
|       | `http://api.int6.whitefalcon.io/` | `Ask administrator` |![API Test Suite](https://github.com/bwalia/whitefalcon/actions/workflows/whitefalcon-api-test.yml/badge.svg?branch=dixa%2Fqa-checks&event=workflow_dispatch)
|       | `http://api.int10.whitefalcon.io/` | `Ask administrator` |![API Test Suite](https://github.com/bwalia/whitefalcon/actions/workflows/whitefalcon-api-test.yml/badge.svg?branch=dixa%2Fqa-checks&event=workflow_dispatch)
| `test` | `https://api.test.whitefalcon.io/` | `Ask administrator` |![API Test Suite](https://github.com/bwalia/whitefalcon/actions/workflows/whitefalcon-api-test.yml/badge.svg?branch=dixa%2Fqa-checks&event=workflow_dispatch)

