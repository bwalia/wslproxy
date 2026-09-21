# Runbook: rotating the S3 credentials

**Applies when** any workflow that touches S3 fails at `Configure AWS credentials`
or `Verify S3 access` with one of:

| AWS error | What it means |
|---|---|
| `InvalidClientTokenId` / `The security token included in the request is invalid.` | The access key id **does not exist**. AWS deleted it. |
| `AWSCompromisedKeyQuarantineV3` in an `AccessDenied` | The key still exists but AWS has quarantined the IAM user. |
| `SignatureDoesNotMatch` | The id and the secret are from different keys. |

Affected workflows: `sync-prod-data-to-s3`, `restore-prod-data-from-s3-to-git`,
`sync-configs-to-environments`, `deploy-wslproxy-virtual-servers`.

---

## Rotate the key last, not first

A deleted or quarantined key means AWS found the key material published
somewhere it can read. Rotating before closing that channel buys about a day:
that is exactly what happened here.

```
2026-09-01        key #1 quarantined (AWSCompromisedKeyQuarantineV3)
2026-09-01 23:00  key #2 installed in AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
2026-09-02 08:33  Sync Prod Data to S3 succeeds  ← the only green run
2026-09-02        the DR restore commits key #2 to this PUBLIC repo (e4bae60f)
2026-09-03 →      every S3 workflow fails: InvalidClientTokenId
```

The successful backup is what published the key that the next run needed. The
loop is self-sustaining, so **find and close the channel first**.

## 1. Close the publication channels

Two were found on 2026-09-21. Both are fixed in the code; verify before rotating.

### a. Gateway republished the key in S3 error bodies

Rules using `amazon_s3_signed_header_validation` proxy to
`s3.<region>.amazonaws.com`. On a refused request S3 answers with XML that
quotes the access key id, and the gateway passed that body through to
anonymous clients — on `www.diytaxreturn.co.uk`, over the public internet.

Fixed by `api/s3_error_filter.lua`, wired into every gateway block in
`nginx-dev.conf.tmpl` and `infra/ansible/roles/wslproxy/templates/nginx.conf.j2`.

Verify on the live edge — the body must not contain `AKIA`:

```bash
curl -s https://www.diytaxreturn.co.uk/ | grep -c AKIA   # must print 0
```

If it still leaks, the edge has not picked up the change:

```bash
# deploy the Lua + nginx template, then
ssh root@lon1.pop0.uk '/usr/local/openresty/bin/openresty -t && systemctl reload openresty'
```

### b. DR restore committed the key to this public repo

`scripts/dr-sync-s3-backup-to-data.sh` redacted `*.json` only, while the prod
host leaves editor droppings (`<uuid>.json.<pid>.<date>~`) beside each rule.
Those were rsync'd in unredacted and committed.

Fixed three ways in that script: the droppings are excluded from both the S3
sync and the restore, redaction now covers every file rather than `*.json`,
and a secret scan fails the run if a credential survives.

Verify no credential is tracked:

```bash
git ls-files data/ | xargs grep -lE '(AKIA|ASIA|AIDA|AROA)[A-Z0-9]{16}'   # must print nothing
```

## 2. Purge the key from git history

Removing the file from `HEAD` does not remove it from history, and GitHub
serves old blobs by SHA. Until this is done, the key is still published.

```bash
# The blob that carried it:
#   data/rules/prod/93893825-237b-4aad-a3af-4aa27d930b9a.json.1325556.2026-08-27@22:17:16~
#   introduced in e4bae60f

git filter-repo --invert-paths \
  --path 'data/rules/prod/93893825-237b-4aad-a3af-4aa27d930b9a.json.1325556.2026-08-27@22:17:16~'
git push --force-with-lease origin main
```

Force-pushing `main` rewrites shared history — coordinate first, and expect
open PRs to need rebasing. Then ask GitHub Support to expire the cached
blobs; a rewritten repo still serves old objects by SHA for a while.

**Treat the key as burned regardless.** History rewriting reduces future
exposure; it does not un-publish what was already fetched.

## 3. Rotate

1. **IAM → Users → `bwalia-s3-publisher` → Security credentials.** Deactivate,
   then delete the exposed key. Do this before creating the replacement.
2. Create a new access key.
3. Update **both** repo secrets from that same key, in one sitting — a
   half-updated pair gives `SignatureDoesNotMatch`:
   ```bash
   gh secret set AWS_ACCESS_KEY_ID     --repo bwalia/wslproxy
   gh secret set AWS_SECRET_ACCESS_KEY --repo bwalia/wslproxy
   ```
4. Update the key in the **prod gateway rules** that sign for S3 — these are
   separate from the CI secrets, and a leak from either one quarantines the
   whole IAM user:
   ```bash
   grep -rl amazon_s3_access_key /opt/nginx/data/rules/prod/
   ```
   Set them through the admin API or UI, not by editing files on disk (the
   editor droppings that leak are made by on-host edits).
5. Review CloudTrail for calls made with the exposed key id.
6. Work the AWS Support case. AWS detaches the quarantine policy once it
   confirms the key is gone.

## 4. Confirm

```bash
gh workflow run sync-prod-data-to-s3.yml --repo bwalia/wslproxy
gh run watch --repo bwalia/wslproxy
```

`Verify S3 access` should print `Authenticated as user/bwalia-s3-publisher`
and `Bucket prefix reachable`. The DR restore then runs automatically and
opens a PR — **check that PR's diff for `AKIA` before merging.**

---

## Why the failure looked opaque

`aws-actions/configure-aws-credentials` validates by calling
`sts:GetCallerIdentity` itself, and aborted the job with the bare line
`The security token included in the request is invalid.` — before the
`aws-s3-preflight` action that exists to explain it. All four workflows now
pass `skip-credential-validation: true` so the preflight is what judges, and
it names this case specifically.
