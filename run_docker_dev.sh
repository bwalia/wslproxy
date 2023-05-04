#!/bin/bash

docker build -t bwalia/hd-openresty .

docker run -p 8088:80 bwalia/hd-openresty
