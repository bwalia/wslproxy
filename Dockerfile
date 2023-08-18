
# Dockerfile - alpine-fat
# https://github.com/openresty/docker-openresty
#
# This builds upon the base OpenResty alpine image that adds
# some build-related packages, has perl installed for opm,
# and includes luarocks and envsubst.
#
# NOTE: For envsubst, we install gettext (envsubst's source package),
#       copy it out, then uninstall gettext (to save some space as envsubst is very small)
#       libintl and musl are dependencies of envsubst, so those are installed as well

ARG RESTY_FAT_IMAGE_BASE="openresty/openresty"
ARG RESTY_FAT_IMAGE_TAG="alpine"

FROM ${RESTY_FAT_IMAGE_BASE}:${RESTY_FAT_IMAGE_TAG}

ARG RESTY_LUAROCKS_VERSION="3.9.0"

LABEL maintainer="Evan Wies <evan@neomantra.net>"
LABEL resty_fat_image_base="${RESTY_FAT_IMAGE_BASE}"
LABEL resty_fat_image_tag="${RESTY_FAT_IMAGE_TAG}"
LABEL resty_luarocks_version="${RESTY_LUAROCKS_VERSION}"

#RUN set -ex && apk --no-cache add sudo

RUN apk add --no-cache --virtual .build-deps \
        perl-dev \
    && apk add --no-cache \
        bash \
        aws-cli \
        build-base \
        curl \
        libintl \ 
        linux-headers \
        make \
        musl \
        outils-md5 \
        perl \
        unzip \
        wget \
        npm \
        yarn \
    && cd /tmp \
    && curl -fSL https://luarocks.github.io/luarocks/releases/luarocks-${RESTY_LUAROCKS_VERSION}.tar.gz -o luarocks-${RESTY_LUAROCKS_VERSION}.tar.gz \
    && tar xzf luarocks-${RESTY_LUAROCKS_VERSION}.tar.gz \
    && cd luarocks-${RESTY_LUAROCKS_VERSION} \
    && ./configure \
        --prefix=/usr/local/openresty/luajit \
        --with-lua=/usr/local/openresty/luajit \
        --lua-suffix=jit-2.1.0-beta3 \
        --with-lua-include=/usr/local/openresty/luajit/include/luajit-2.1 \
    && make build \
    && make install \
    && cd /tmp \
    && rm -rf luarocks-${RESTY_LUAROCKS_VERSION} luarocks-${RESTY_LUAROCKS_VERSION}.tar.gz \
    && apk add --no-cache --virtual .gettext gettext \
    && mv /usr/bin/envsubst /tmp/ \
    && apk del .build-deps .gettext \
    && mv /tmp/envsubst /usr/local/bin/

# Add LuaRocks paths
# If OpenResty changes, these may need updating:
#    /usr/local/openresty/bin/resty -e 'print(package.path)'
#    /usr/local/openresty/bin/resty -e 'print(package.cpath)'
ENV LUA_PATH="/usr/local/openresty/site/lualib/?.ljbc;/usr/local/openresty/site/lualib/?/init.ljbc;/usr/local/openresty/lualib/?.ljbc;/usr/local/openresty/lualib/?/init.ljbc;/usr/local/openresty/site/lualib/?.lua;/usr/local/openresty/site/lualib/?/init.lua;/usr/local/openresty/lualib/?.lua;/usr/local/openresty/lualib/?/init.lua;./?.lua;/usr/local/openresty/luajit/share/luajit-2.1.0-beta3/?.lua;/usr/local/share/lua/5.1/?.lua;/usr/local/share/lua/5.1/?/init.lua;/usr/local/openresty/luajit/share/lua/5.1/?.lua;/usr/local/openresty/luajit/share/lua/5.1/?/init.lua"

ENV LUA_CPATH="/usr/local/openresty/site/lualib/?.so;/usr/local/openresty/lualib/?.so;./?.so;/usr/local/lib/lua/5.1/?.so;/usr/local/openresty/luajit/lib/lua/5.1/?.so;/usr/local/lib/lua/5.1/loadall.so;/usr/local/openresty/luajit/lib/lua/5.1/?.so"

RUN luarocks install lua-resty-jwt
RUN luarocks install lua-resty-session
RUN luarocks install lua-resty-http
RUN luarocks install lua-resty-openidc
RUN luarocks install base64
RUN opm get ip2location/ip2location-resty
RUN luarocks install lua-resty-redis-connector
RUN luarocks install lua-resty-dns
RUN luarocks install lua-resty-resolver
RUN opm get bungle/lua-resty-session
#COPY nginx/test.conf /usr/local/openresty/nginx/conf/nginx.conf
# COPY nginx/hd4dp.conf /etc/nginx/conf.d/hd4dp.conf
# COPY nginx/sessions_demo_server.conf /etc/nginx/conf.d/sessions_demo_server.conf
ENV NGINX_CONFIG_DIR="/opt/nginx/"
RUN mkdir -p ${NGINX_CONFIG_DIR} && chmod 777 ${NGINX_CONFIG_DIR}

ARG APP_ENV="dev"
ARG ENV_FILE=".env.dev"

COPY ./system ${NGINX_CONFIG_DIR}system

COPY ./openresty-admin /usr/local/openresty/nginx/html/openresty-admin
COPY ./data ${NGINX_CONFIG_DIR}data
COPY ./data/settings.json ${NGINX_CONFIG_DIR}data/settings.json
COPY ./api /usr/local/openresty/nginx/html/api
#COPY $ENV_FILE /usr/local/openresty/nginx/html/openresty-admin.env
COPY ./nginx-${APP_ENV}.conf.tmpl /tmp/nginx.conf.tmpl
COPY ./resolver.conf.tmpl /tmp/resolver.conf.tmpl
COPY ./html/swagger /usr/local/openresty/nginx/html/swagger

#RUN chmod -R 777 /usr/local/openresty/nginx/html/data && chmod -R 777 /usr/local/openresty/nginx/html/data/servers 

RUN cd /tmp/ && wget https://edgeone-public.s3.eu-west-2.amazonaws.com/src/openresty/IP2LOCATION-LITE-DB11.IPV6.BIN/IP2LOCATION-LITE-DB11.IPV6.BIN -O /tmp/IP2LOCATION-LITE-DB11.IPV6.BIN
#   COPY ./IP2LOCATION-LITE-DB11.IPV6.BIN /tmp

ENV DNS_RESOLVER="127.0.0.11"
ARG DNS_RESOLVER="127.0.0.11"

# ARG DOCKERIZE_VERSION="v0.6.1"
# RUN wget https://github.com/jwilder/dockerize/releases/download/${DOCKERIZE_VERSION}/dockerize-alpine-linux-amd64-${DOCKERIZE_VERSION}.tar.gz \
#     && tar -C /usr/local/bin -xzvf dockerize-alpine-linux-amd64-${DOCKERIZE_VERSION}.tar.gz \
#     && rm dockerize-alpine-linux-amd64-${DOCKERIZE_VERSION}.tar.gz

RUN cp /tmp/nginx.conf.tmpl /usr/local/openresty/nginx/conf/nginx.conf
RUN cp /tmp/resolver.conf.tmpl /tmp/resolver.conf

#RUN dockerize -template /usr/local/openresty/nginx/conf/nginx.conf:/usr/local/openresty/nginx/conf/nginx.conf

RUN sed -i "s/resolver 127.0.0.11/resolver ${DNS_RESOLVER}/g" /tmp/resolver.conf

# set environment file based on the argument

WORKDIR /usr/local/openresty/nginx/html/openresty-admin/

RUN cd /usr/local/openresty/nginx/html/openresty-admin && yarn install \
  --prefer-offline \
  --frozen-lockfile \
  --non-interactive \
  --production=false
  
RUN cd /usr/local/openresty/nginx/html/openresty-admin/ && yarn build
#--dest /usr/local/openresty/nginx/html/openresty-admin/dist

RUN chmod -R 777 ${NGINX_CONFIG_DIR}system && \
    chmod -R 777 ${NGINX_CONFIG_DIR}data && \
    chmod -R 777 ${NGINX_CONFIG_DIR}data/servers && \
    chmod -R 777 ${NGINX_CONFIG_DIR}data/rules && \
    chmod -R 777 ${NGINX_CONFIG_DIR}data/security_rules.json && \
    chown -R nobody:root ${NGINX_CONFIG_DIR}data/ && \
    chmod 777 ${NGINX_CONFIG_DIR}data/settings.json

ENTRYPOINT ["/usr/local/openresty/nginx/sbin/nginx", "-g", "daemon off;"]