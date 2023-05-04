#!/bin/bash

clear

docker cp nginx-dev.conf mynginx:/usr/local/openresty/nginx/conf/nginx.conf
docker cp response.lua mynginx:/usr/local/openresty/nginx/html/first.lua
docker cp api/ mynginx:/usr/local/openresty/nginx/html/
docker cp data/ mynginx:/usr/local/openresty/nginx/html/
docker cp openresty-admin/src mynginx:/usr/local/openresty/nginx/html/openresty-admin/
docker exec -it mynginx openresty -t 
docker exec -it mynginx openresty -s reload