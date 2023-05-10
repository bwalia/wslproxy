# WhiteFalcon

Whitefalcon is CDN

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
docker compose up -d --build
```

## Usage

If you want to change anything in the react-admin then you need to run the 
```
yarn build
```
on your local system. It will automatically sync the build changes with the docker.
