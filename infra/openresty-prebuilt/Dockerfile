# syntax=docker/dockerfile:1.7
# ============================================================================
# Prebuilt OpenResty for wslproxy — compile ONCE in Docker, extract the
# /usr/local/openresty tree, install it on bare-metal targets (pop0 etc.)
# instead of compiling from source on every host (the slow/flaky
# openresty.sh.j2 path).
#
# CRITICAL: a compiled binary is libc-specific. Build on a base whose
# glibc + arch MATCH the target host, or the extracted nginx won't run.
# Default debian:13 (trixie) matches the int/prod Debian hosts. Override
# with --build-arg BASE_IMAGE=debian:12 (etc.) to match a different target.
#
# Mirrors: roles/wslproxy/templates/openresty.sh.j2 (compile + luarocks),
#          roles/wslproxy/tasks/deploy_deps.yml (rock list),
#          roles/wslproxy/templates/cdn-dependencies.sh.j2 (opm + lualibs).
# ============================================================================
ARG BASE_IMAGE=debian:13

# ── Stage 1: build everything into /usr/local/openresty ─────────────────────
FROM ${BASE_IMAGE} AS builder
ARG OPENRESTY_VERSION=1.29.2.1
ARG LUAROCKS_VERSION=3.11.1
ENV DEBIAN_FRONTEND=noninteractive
ENV PATH=/usr/local/openresty/luajit/bin:/usr/local/openresty/bin:/usr/local/bin:/usr/bin:/bin

# Build deps = roles/wslproxy/vars/Debian.yml os_build_deps + PCRE2 + git.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libssl-dev perl make build-essential curl zlib1g-dev wget gcc unzip \
      lua5.1 liblua5.1-0-dev libpcre2-dev git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# ── Compile OpenResty (configure flags identical to openresty.sh.j2:72) ──
RUN cd /tmp \
 && wget -q "https://openresty.org/download/openresty-${OPENRESTY_VERSION}.tar.gz" \
 && tar -xzf "openresty-${OPENRESTY_VERSION}.tar.gz" \
 && cd "openresty-${OPENRESTY_VERSION}" \
 && ./configure --prefix=/usr/local/openresty \
      --with-stream_realip_module --with-http_ssl_module \
      --with-http_gzip_static_module --with-http_sub_module \
      --with-http_v2_module --with-http_stub_status_module \
      --with-stream --with-http_slice_module \
 && make -j"$(nproc)" \
 && make install \
 && ln -sf /usr/local/openresty/nginx/sbin/nginx /usr/bin/openresty \
 && /usr/bin/openresty -v \
 && rm -rf /tmp/openresty-*

# ── luarocks built with system Lua 5.1 (NOT LuaJIT — the 65536 constant
#    limit can't parse the luarocks manifest; see openresty.sh.j2 notes) ──
RUN cd /tmp \
 && wget -q "https://luarocks.github.io/luarocks/releases/luarocks-${LUAROCKS_VERSION}.tar.gz" \
 && tar xzf "luarocks-${LUAROCKS_VERSION}.tar.gz" \
 && cd "luarocks-${LUAROCKS_VERSION}" \
 && ./configure --prefix=/usr/local \
      --with-lua=/usr --with-lua-include=/usr/include/lua5.1 --lua-suffix=5.1 \
 && make && make install \
 && luarocks --version \
 && rm -rf /tmp/luarocks-*

# ── Rocks into the OpenResty LuaJIT tree (deploy_deps.yml). lua-resty-jwt
#    pinned to 0.2.3; the rest best-effort — sockproc (lua-resty-auto-ssl)
#    can fail under newer GCC, matching the role's ignore_errors. The build
#    FAILS only if a non-optional rock is missing, so verify after. ──
RUN set -eux; TREE=/usr/local/openresty/luajit; \
    luarocks install --tree="$TREE" lua-resty-jwt 0.2.3; \
    for r in lua-resty-session lua-resty-http lua-resty-openidc base64 \
             lua-resty-redis-connector lua-resty-dns lua-resty-resolver \
             luafilesystem lua-resty-auto-ssl pgmoon lua-resty-consul; do \
      luarocks install --tree="$TREE" "$r" || echo "WARN: optional rock '$r' failed to install"; \
    done; \
    luarocks list --tree="$TREE"

# ── opm packages + extra lualibs (cdn-dependencies.sh.j2) ──
RUN set -eux; \
    opm get olegabr/lua-resty-ip2location ip2location/ip2location-resty \
            bungle/lua-resty-session bungle/lua-resty-template \
            thibaultcha/lua-resty-mlcache 3scale/lua-resty-env || true; \
    cd /tmp; \
    git clone --depth 1 https://github.com/knyar/nginx-lua-prometheus.git; \
    cp nginx-lua-prometheus/prometheus.lua \
       nginx-lua-prometheus/prometheus_keys.lua \
       nginx-lua-prometheus/prometheus_resty_counter.lua \
       /usr/local/openresty/lualib/; \
    git clone --depth 1 https://github.com/openresty/lua-resty-upstream-healthcheck.git; \
    mkdir -p /usr/local/openresty/lualib/resty/upstream; \
    cp lua-resty-upstream-healthcheck/lib/resty/upstream/healthcheck.lua \
       /usr/local/openresty/lualib/resty/upstream/; \
    rm -rf /tmp/nginx-lua-prometheus /tmp/lua-resty-upstream-healthcheck

# MinIO client (host config-backup tool). Kept inside the openresty tree so
# it travels with the extracted tarball; the installer symlinks it into PATH.
RUN wget -q https://dl.min.io/client/mc/release/linux-amd64/mc \
      -O /usr/local/openresty/bin/mc && chmod +x /usr/local/openresty/bin/mc

# ── Stage 2: runtime image = matching base + only runtime libs + the tree.
#    The apt list here is exactly what a target host needs alongside the
#    extracted tree. Extraction (docker cp) pulls /usr/local/openresty. ──
FROM ${BASE_IMAGE} AS runtime
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      libpcre2-8-0 libssl3 zlib1g ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /usr/local/openresty /usr/local/openresty
RUN ln -sf /usr/local/openresty/nginx/sbin/nginx /usr/bin/openresty \
 && /usr/bin/openresty -V
