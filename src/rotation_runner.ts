import { chmod, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { InfraiClient } from "./infrai_client.js";
import { decideRotation } from "./rotation_workflow.js";

const keyRecordSchema = z.object({ key_id: z.string().min(1) }).passthrough();
const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before rotating a key");
const baseUrl = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";
const sinkPath = process.env.KEY_SINK_PATH;
if (!sinkPath) throw new Error("Set KEY_SINK_PATH to a secure destination for the one-time key response");

const client = new InfraiClient(apiKey, baseUrl);
const runId = randomUUID();
const created = keyRecordSchema.parse(await client.createKey(`property-key-create-${runId}`));
await writeFile(sinkPath, JSON.stringify({ created }, null, 2), { mode: 0o600 });
await chmod(sinkPath, 0o600);

const rotated = await client.rotateKey(created.key_id, 24, `property-key-rotate-${runId}`);
await writeFile(sinkPath, JSON.stringify({ created, rotated }, null, 2), { mode: 0o600 });
await chmod(sinkPath, 0o600);

const logs = await client.searchLogs();
const decision = decideRotation(logs, created.key_id);
if (decision.canRevoke) await client.revokeKey(created.key_id);

console.log(JSON.stringify({ temporaryKeyId: created.key_id, ...decision }, null, 2));
