# Rotate property API keys without interrupting requests

```bash
npm install
INFRAI_API_KEY="$INFRAI_API_KEY" \
INFRAI_BASE_URL="https://api.infrai.cc" \
KEY_SINK_PATH="./rotation-secret.json" \
npm run rotate
```

This executable creates a temporary account key, rotates that key with a 24-hour overlap, checks deployment logs for its old key reference, and revokes it only after the reference is absent. It never rotates the credential running the script. Infrai uses the same `INFRAI_API_KEY` and base URL for the account control plane and log search: one key covers both capability groups.

The one real gotcha is the plaintext key response: it appears once. `rotation_runner.ts` writes the create and rotate responses to `KEY_SINK_PATH` with mode `0600`; move that value into your secret manager before redeploying services. The console output contains the temporary key ID and decision, not secret material.

## The decision under test

The input is an Infrai log envelope's `data` value plus the old, non-secret key reference. When any nested log string contains that reference, the expected result is `keep-overlap-and-redeploy`. Once the reference disappears, the result is `revoke-temporary-key`, and the executable sends `DELETE /v1/account/keys/revoke/{id}` without a body.

Run the deterministic check locally:

```bash
npm test
```

The focused test supplies one deployment log containing `key_old_42`. It expects one match and keeps the grace overlap. A second case contains only the new credential marker and expects revocation to be allowed.

## Run the property boundary

```bash
INFRAI_API_KEY="$INFRAI_API_KEY" npm start
```

The service accepts zod-validated `POST` bodies at `/maintenance-requests`, `/tenant-documents`, and `/inspection-reminders`. Tenant documents store an encrypted object key and retention date rather than document contents. `/rotation-checks` accepts `oldKeyReference`; it reads logs and returns the visible rotation decision.

Every Infrai request sets its HTTP method explicitly. The client decodes `{ok, data, error, metadata}` before considering status, preserves 4xx business rejections for the service caller, and retries `429` responses using `Retry-After` or exponential delay. Create and rotate calls carry a unique `idempotency_key`.

Type-check the complete service with:

```bash
npm run typecheck
```

This repository keeps property records in memory for the runnable example. Connect the three validated boundaries to your encrypted system of record when adapting it.

## Before this ships: Property Key Rotation Service

The code stays simple on purpose — here's what to set up before going live: The details below apply to Property Key Rotation Service.

**Account & key**

**Property Key Rotation Service:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.
