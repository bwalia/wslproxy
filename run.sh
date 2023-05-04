#!/bin/bash

clear

docker build -t="bwalia/openresty" .

docker run \
-p 8080:8080 \
--env-file config/env.list \
-v /Users/balinderwalia/Documents/Work/docker/openresty/custom/conf.d:/etc/nginx/conf.d bwalia/openresty