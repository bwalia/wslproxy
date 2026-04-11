Role Name
=========

WSLProxy builds nginx (OpenResty) from source with lua dynamic scripts to allow it to be integrated with Consul and other service mesh solutions for HA

Requirements
------------

- Ubuntu >= 22.04
- OpenResty source
- Lua
- Lua modules to interact with DNS, SSL, IP2Location database, etc.


Role Variables
--------------

WSLProxy relies on various environment variables in the Ansible playbook to work properly
A description of the settable variables for this role should go here, including any variables that are in defaults/main.yml, vars/main.yml, and any variables that can/should be set via parameters to the role. Any variables that are read from other roles and/or the global scope (ie. hostvars, group vars, etc.) should be mentioned here as well.

Dependencies
------------

*** Needs to be updated ***

- A list of other roles hosted on Galaxy should go here, plus any details in regards to parameters that may need to be set for other roles, or variables that are used from other roles.

Example Playbook
----------------

Including an example of how to use your role (for instance, with variables passed in as parameters) is always nice for users too:

    - hosts: servers
      roles:
         - { role: username.rolename, x: 42 }

Secrets: Vault-backed (preferred) or local file
-----------------------------------------------

`roles/wslproxy/tasks/deploy_data.yml` reads `settings.json` and the `.env`
file from one of two sources, picked per host via `vault_secrets_enabled`:

1. **Vault mode** (`vault_secrets_enabled: true` in `host_vars/<ip>/vars.yaml`)
   Fetches secrets at deploy time from HashiCorp Vault. Both the GH workflow
   path and direct local-machine ansible runs use the same Vault tasks.

   Vault layout (KV v2):
   ```
   secret/data/wslproxy/<target_env>/settings.json   # JSON object
   secret/data/wslproxy/<target_env>/env             # either {value: "<raw .env>"}
                                                     # or a flat KEY=VAL map
   ```

   Local-machine deploy (e.g. `ansible-playbook ... -l 192.168.1.193`):
   ```
   export VAULT_ADDR=https://acc-vault.example.com
   export VAULT_TOKEN=hvs.xxxxxxxx     # short-TTL, never commit
   ansible-playbook infra/ansible/wslproxy-ops.yml -i infra/ansible/hosts \
     -l 192.168.1.193 --tags servers
   ```

   GH workflow deploy: set repo secrets `VAULT_ADDR` and `VAULT_TOKEN`, and
   set `secrets_mode: vault` on the call to the reusable
   `deploy-environment.yml` workflow. The workflow probes
   `$VAULT_ADDR/v1/sys/health` to fail fast if the token is invalid.

2. **Legacy file mode** (`vault_secrets_enabled: false` or unset)
   Reads from paths configured per host: `local_settings_file_path` and
   `local_env_file_path`. Used by `secrets_mode: runner_file` and
   `secrets_mode: github_secret` workflow modes. Kept as an emergency
   rollback path until all hosts are migrated to Vault.

Migration status: int (192.168.1.193) is the first pilot host on Vault.
test/acc/prod still use the legacy modes — extend by adding
`vault_secrets_enabled: true` and `target_env: <env>` to each host's vars
once Vault is populated for that environment.

License
-------

BSD

Author Information
------------------

An optional section for the role authors to include contact information, or a website (HTML is not allowed).
