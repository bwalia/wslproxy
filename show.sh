#!/bin/bash

set -x 

HOST_ENDPOINT_UNSECURE_URL="http://localhost:8081"
curl -IL $HOST_ENDPOINT_UNSECURE_URL
os_type=$(uname -s)

if [ "$os_type" = "Darwin" ]; then
open $HOST_ENDPOINT_UNSECURE_URL
fi

if [ "$os_type" = "Linux" ]; then
xdg-open $HOST_ENDPOINT_UNSECURE_URL
fi

HOST_ENDPOINT_UNSECURE_URL="http://localhost:8000"
curl -IL $HOST_ENDPOINT_UNSECURE_URL

if [ "$os_type" = "Darwin" ]; then
open $HOST_ENDPOINT_UNSECURE_URL
fi

if [ "$os_type" = "Linux" ]; then
xdg-open $HOST_ENDPOINT_UNSECURE_URL
fi
