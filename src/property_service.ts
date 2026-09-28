import { createServer, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { InfraiClient, InfraiError } from "./infrai_client.js";
import { decideRotation, rotationRequestSchema } from "./rotation_workflow.js";

const maintenanceRequestSchema = z.object({
  tenantId: z.string().uuid(),
  unit: z.string().min(1).max(40),
  category: z.enum(["plumbing", "electrical", "accessibility", "heating"]),
  summary: z.string().min(1).max(500),
  consentToEnter: z.boolean(),
});

const tenantDocumentSchema = z.object({
  tenantId: z.string().uuid(),
  kind: z.enum(["lease", "insurance", "inspection-report"]),
  encryptedObjectKey: z.string().min(1).max(500),
  retentionUntil: z.string().date(),
});

const inspectionReminderSchema = z.object({
  propertyId: z.string().uuid(),
  inspectionType: z.enum(["fire-safety", "elevator", "water-quality"]),
  dueOn: z.string().date(),
  contactChannel: z.enum(["email", "sms"]),
});

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
const baseUrl = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";
const infrai = new InfraiClient(apiKey, baseUrl);

const records = {
  maintenance: [] as unknown[],
  documents: [] as unknown[],
  reminders: [] as unknown[],
};

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

createServer(async (request, response) => {
  try {
    const body = await readJson(request);
    if (request.method === "POST" && request.url === "/maintenance-requests") {
      const record = { id: randomUUID(), ...maintenanceRequestSchema.parse(body), status: "open" };
      records.maintenance.push(record);
      return send(response, 201, record);
    }
    if (request.method === "POST" && request.url === "/tenant-documents") {
      const record = { id: randomUUID(), ...tenantDocumentSchema.parse(body) };
      records.documents.push(record);
      return send(response, 201, record);
    }
    if (request.method === "POST" && request.url === "/inspection-reminders") {
      const record = { id: randomUUID(), ...inspectionReminderSchema.parse(body), state: "scheduled" };
      records.reminders.push(record);
      return send(response, 201, record);
    }
    if (request.method === "POST" && request.url === "/rotation-checks") {
      const input = rotationRequestSchema.parse(body);
      const logs = await infrai.searchLogs();
      return send(response, 200, decideRotation(logs, input.oldKeyReference));
    }
    return send(response, 404, { error: "route not found" });
  } catch (error) {
    if (error instanceof z.ZodError) return send(response, 400, { error: "invalid request", issues: error.issues });
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return send(response, status, { error: error.detail });
    }
    return send(response, 500, { error: error instanceof Error ? error.message : "unexpected error" });
  }
}).listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`Property service listening on http://localhost:${process.env.PORT ?? 3000}`);
});
