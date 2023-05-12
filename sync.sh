#!/bin/bash

clear

docker cp nginx-dev.conf openresty-alpine:/usr/local/openresty/nginx/conf/nginx.conf
docker cp response.lua openresty-alpine:/usr/local/openresty/nginx/html/first.lua
docker cp api/ openresty-alpine:/usr/local/openresty/nginx/html/
docker cp data/ openresty-alpine:/usr/local/openresty/nginx/html/
docker cp openresty-admin/src openresty-alpine:/usr/local/openresty/nginx/html/openresty-admin/
docker exec -it openresty-alpine openresty -t 
docker exec -it openresty-alpine openresty -s reload