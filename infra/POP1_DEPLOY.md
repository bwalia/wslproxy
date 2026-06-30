# POP1 deploy runbook — 18.133.126.242 (AWS eu-west-2)

New production POP. Dashboard: **pop1.diytaxreturn.co.uk**. Deployed with **local
Ansible** (GitHub workflows are being retired for Argo). The delivery pipeline
also carries a pop1 stage (5c, runs last) for when/if a release-branch run is used.

Run everything below **from the Mac that holds the EC2 SSH key.**

---

## 0. Prerequisites (check first)

- **SSH key** for `admin@18.133.126.242` (London keypair, e.g. `cdn_london_keypair.pem`).
  Test it:
  ```bash
  ssh -i /path/to/key.pem admin@18.133.126.242 'whoami; cat /etc/os-release | grep PRETTY; dpkg --print-architecture'
  ```
  `admin` must have passwordless sudo (default on Debian cloud AMIs).
- **DNS:** `pop1.diytaxreturn.co.uk` → `18.133.126.242` (A record). Required for the
  Let's Encrypt cert auto-ssl issues for the dashboard.
- **Security group:** inbound **80, 443, 7691** open (80/443 for the dashboard +
  ACME; 7691 is the admin/API + health port).
- EIP `18.133.126.242` associated with the instance.

## 1. Get the repo on this Mac

```bash
git clone https://github.com/bwalia/wslproxy.git   # or pull latest main
cd wslproxy
# (POP1 host_vars + inventory entry are already on main once this lands)
pip install ansible 2>/dev/null || brew install ansible
ansible-galaxy collection install ansible.posix community.general
```

## 2. Provide pop1 secrets (settings.json + .env)

Ansible reads them from the paths in `host_vars/18.133.126.242/vars.yaml`
(`/tmp/wslproxy-pop1/`). Seed them — easiest is to reuse the prod SOPS secrets:

```bash
mkdir -p /tmp/wslproxy-pop1
export SOPS_AGE_KEY='AGE-SECRET-KEY-1...'   # the real prod key (same as the SOPS_AGE_KEY GH secret)
sops -d infra/secrets/prod/settings.sops.json > /tmp/wslproxy-pop1/settings.json
sops -d --input-type dotenv --output-type dotenv infra/secrets/prod/env.sops.env > /tmp/wslproxy-pop1/.env
```
(or just copy a known-good prod `settings.json` + `.env` into `/tmp/wslproxy-pop1/`.)

## 3. Deploy from local Ansible → 18.133.126.242

First (full) deploy — installs OpenResty + deps, configures nginx, deploys code+data:

```bash
KEY=/path/to/key.pem

ansible-playbook infra/ansible/wslproxy-ops.yml \
  -i infra/ansible/hosts \
  -l 18.133.126.242 \
  --private-key "$KEY" \
  -u admin --become \
  --extra-vars "target_env=prod \
    nginx_user_password=THISCOMESFROMSECRETS \
    local_settings_file_path=/tmp/wslproxy-pop1/settings.json \
    local_env_file_path=/tmp/wslproxy-pop1/.env \
    wslproxy_build_number=local-$(date +%s) \
    wslproxy_git_sha=$(git rev-parse --short HEAD) \
    wslproxy_git_repo=bwalia/wslproxy \
    wslproxy_deployment_time=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

Faster subsequent code/HTML/nginx changes — add a tag:
`--tags code` (Lua only) · `--tags dashboard-next` (Next.js) · `--tags nginx` · `--tags servers`.

> **Faster OpenResty install (optional):** the full deploy compiles OpenResty from
> source on the host (slow). To skip that, use the prebuilt path instead —
> `TARGET=admin@18.133.126.242 BASE_IMAGE=debian:13 infra/openresty-prebuilt/openresty-express-install.sh full`
> — then run the playbook with `--tags nginx,servers,code,dashboard-next` (skip `build`).

## 4. Verify

```bash
# Health on the admin/API port
curl -sf -o /dev/null -w 'health: %{http_code}\n' http://18.133.126.242:7691/health

# Dashboard over HTTPS (after DNS + first cert issuance; may take a few seconds)
curl -skI https://pop1.diytaxreturn.co.uk | head -1
ssh -i "$KEY" admin@18.133.126.242 'sudo /usr/local/openresty/nginx/sbin/nginx -t'
```

If the cert isn't issued: confirm DNS resolves to 18.133.126.242 and port 80 is
reachable (auto-ssl uses HTTP-01), then `curl https://pop1.diytaxreturn.co.uk/` to
trigger issuance.

## 5. Pipeline note (future / Argo migration)

`deploy-wslproxy-delivery-pipeline.yml` now has **Stage 5c → pop1**, gated to run
**after** pop0 + lon1 and only when all prior stages pass (push to `release`/`main`,
or `workflow_dispatch` with `TARGET_HOST=18.133.126.242` / `all`). It self-seeds
from the host's live config (`seed_from_host: true`), so once this local deploy
seeds pop1, a pipeline run can redeploy it without any stored secret.
