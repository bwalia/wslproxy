# Prebuilt OpenResty — compile in Docker, install on bare metal

Compile OpenResty (+ all wslproxy Lua deps) **once** in a Docker image, extract
the `/usr/local/openresty` tree, and install it on a target host — instead of
the slow/flaky source compile that `roles/wslproxy/templates/openresty.sh.j2`
runs on every host. No registry/artifact push: local `docker build` →
`docker cp` → `rsync` over SSH.

## Files
- `Dockerfile` — Debian multi-stage build. Mirrors the role's
  `openresty.sh.j2` (compile + configure flags), `deploy_deps.yml` (rock list),
  and `cdn-dependencies.sh.j2` (opm + prometheus/healthcheck lualibs).
- `openresty-express-install.sh` — build/extract/install orchestrator.

## Usage

```bash
cd infra/openresty-prebuilt

# Full: build image -> extract -> install OpenResty on pop0 -> sync api/+html/ -> reload
TARGET=bwalia@187.124.112.155 ./openresty-express-install.sh full

# Frequent path: only Lua/HTML changed -> sync + reload (no OpenResty reinstall)
TARGET=bwalia@187.124.112.155 ./openresty-express-install.sh code

# Just build the image / just extract a tarball
./openresty-express-install.sh build
./openresty-express-install.sh extract
```

Config via env: `TARGET`, `IMAGE`, `BASE_IMAGE`, `PLATFORM`, `OPENRESTY_VERSION`,
`PULL=1` (pull instead of build), `SSH_OPTS`.

## Hard requirements / gotchas

- **glibc + arch must match the target.** Default `BASE_IMAGE=debian:13`,
  `PLATFORM=linux/amd64` → matches the Debian amd64 hosts. A musl (Alpine) or
  arm64 binary will NOT run on amd64 Debian. On Apple Silicon the build runs
  under emulation so the produced binary is still amd64 (correct for pop0).
- **Never clobbers live config/app.** The tree rsync excludes `nginx/conf/`,
  `nginx/html/`, `nginx/logs/`, so the host's templated `nginx.conf`, server
  confs and app code survive. App code is synced separately from the git
  checkout (the source of truth) to the same paths Ansible uses.
- **`openresty -t` gates the restart** — a bad config aborts before reload.
- **Target needs passwordless sudo** (rsync uses `--rsync-path="sudo rsync"`);
  `infra/scripts`/`setup-runner-host.sh`-style setup already provides this on
  the runner hosts.
- **Not host runtime setup.** The IP2Location DB, `/opt/nginx/data` dirs and the
  resty-auto-ssl fallback cert are still provisioned by the Ansible role /
  `cdn-dependencies.sh.j2` — this tool only replaces the *compile* step.
- **First-time hosts:** `nginx/conf` is excluded, so the host must already have
  a valid wslproxy `nginx.conf` (run the Ansible `nginx` tag once). For an
  already-deployed host like pop0 it's already there.

## When to rebuild the image

Only when the OpenResty version, configure flags, or the rock/opm list change.
Day-to-day Lua/HTML edits use `code` mode and never touch the image.
