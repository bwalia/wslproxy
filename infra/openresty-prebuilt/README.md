# Prebuilt OpenResty — compile in Docker, install on bare metal

Compile OpenResty (+ all wslproxy Lua deps) **once** in a Docker image, extract
the `/usr/local/openresty` tree, and install it on a target host — instead of
the slow/flaky source compile that `roles/wslproxy/templates/openresty.sh.j2`
runs on every host.

## CI (preferred)

`.github/workflows/build-openresty-prebuilt.yml` builds and pushes:

- `docker.io/bwalia/wslproxy-openresty:1.29.2.1`
- `docker.io/bwalia/wslproxy-openresty:latest`

Uses Docker Buildx with `cache-from/to: type=gha` so rebuilds after Dockerfile
or rock-list changes are incremental. Triggers on changes under
`infra/openresty-prebuilt/**` or `workflow_dispatch`.

## Ansible (default for bare-metal deploys)

Role default: `openresty_install_mode: prebuilt` ([`defaults/main.yml`](../ansible/roles/wslproxy/defaults/main.yml)).

When OpenResty is missing or the wrong version (`openresty_needs_build`), or
when `--tags build` / `DEPLOY_MODE=build|full` runs, Ansible:

1. `docker pull` of `openresty_prebuilt_image` on the **controller** (runner)
2. Extracts `/usr/local/openresty` from the image
3. `rsync` to the target (excludes `nginx/conf`, `nginx/html`, `nginx/logs`)

Tasks: [`roles/wslproxy/tasks/openresty_prebuilt.yml`](../ansible/roles/wslproxy/tasks/openresty_prebuilt.yml).

Escape hatch (legacy on-host compile):

```bash
ansible-playbook ... --extra-vars 'openresty_install_mode=source'
```

## Manual / express install

```bash
cd infra/openresty-prebuilt

# Pull published image (default) → extract → install on target → sync api/+html/
TARGET=administrator@85.190.106.189 ./openresty-express-install.sh full

# Frequent path: only Lua/HTML changed -> sync + reload (no OpenResty reinstall)
TARGET=administrator@85.190.106.189 ./openresty-express-install.sh code

# Local build instead of pull
PULL=0 ./openresty-express-install.sh build
./openresty-express-install.sh extract
```

Config via env: `TARGET`, `IMAGE` (default `docker.io/bwalia/wslproxy-openresty:1.29.2.1`),
`BASE_IMAGE`, `PLATFORM`, `OPENRESTY_VERSION`, `PULL` (default `1`), `SSH_OPTS`.

## Files

- `Dockerfile` — Debian multi-stage build. Mirrors the role's
  `openresty.sh.j2` (compile + configure flags), `deploy_deps.yml` (rock list),
  and `cdn-dependencies.sh.j2` (opm + prometheus/healthcheck lualibs).
- `openresty-express-install.sh` — build/pull/extract/install orchestrator.

## Hard requirements / gotchas

- **glibc + arch must match the target.** Default `BASE_IMAGE=debian:13`,
  `PLATFORM=linux/amd64` → matches the Debian amd64 hosts. A musl (Alpine) or
  arm64 binary will NOT run on amd64 Debian. On Apple Silicon the build runs
  under emulation so the produced binary is still amd64 (correct for pop0).
- **Never clobbers live config/app.** The tree rsync excludes `nginx/conf/`,
  `nginx/html/`, `nginx/logs/`, so the host's templated `nginx.conf`, server
  confs and app code survive. App code is synced separately from the git
  checkout (the source of truth) to the same paths Ansible uses.
- **`openresty -t` gates the restart** — a bad config aborts before reload
  (express-install / finalize handlers).
- **Controller needs Docker** for prebuilt mode; **target needs passwordless
  sudo** for remote rsync (`--rsync-path="sudo rsync"`).
- **Not host runtime setup.** The IP2Location DB, `/opt/nginx/data` dirs and the
  resty-auto-ssl fallback cert are still provisioned by the Ansible role /
  `cdn-dependencies.sh.j2` — this tool only replaces the *compile* step.
- **First-time hosts:** `nginx/conf` is excluded, so the host must already have
  a valid wslproxy `nginx.conf` (run the Ansible `nginx` tag once). For an
  already-deployed host like pop0 it's already there.

## When to rebuild the image

Only when the OpenResty version, configure flags, or the rock/opm list change.
Day-to-day Lua/HTML edits use `DEPLOY_MODE=code` / express `code` mode and
never touch the image.
