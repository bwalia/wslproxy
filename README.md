# whitefalcon

Whitefalcon is an API Gateway and a CDN, and it fully powered itself via API so that it can be fully configured automatically via pipelines and release mangement.

## Rquirements
Docker

node > 16

yarn


## Installation

```python
cd openresty-alpine

# install the libraries
yarn install

# create the build
yarn build

# Run the docker
./run.sh && ./show.sh
```

## Usage

If you want to change anything in the react-admin then you need to run the 
```
yarn build
```
on your local system. It will automatically sync the build changes with the docker.