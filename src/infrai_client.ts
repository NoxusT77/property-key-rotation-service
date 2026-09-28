export type InfraiFailure = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiFailure;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly detail: InfraiFailure;

  constructor(
    status: number,
    detail: InfraiFailure,
  ) {
    super(detail.message ?? detail.code ?? "Infrai request rejected");
    this.name = "InfraiError";
    this.status = status;
    this.detail = detail;
  }
}

export class InfraiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly pause: (milliseconds: number) => Promise<void>;

  constructor(
    apiKey: string,
    baseUrl: string,
    fetcher: typeof fetch = fetch,
    pause: (milliseconds: number) => Promise<void> = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
    this.pause = pause;
  }

  createKey(idempotencyKey: string): Promise<unknown> {
    return this.request("/v1/account/keys/create", {
      method: "POST",
      body: JSON.stringify({ name: "property-rotation-candidate", idempotency_key: idempotencyKey }),
    });
  }

  rotateKey(id: string, graceHours: number, idempotencyKey: string): Promise<unknown> {
    return this.request(`/v1/account/keys/rotate/${encodeURIComponent(id)}`, {
      method: "POST",
      body: JSON.stringify({ grace_hours: graceHours, idempotency_key: idempotencyKey }),
    });
  }

  searchLogs(): Promise<unknown> {
    return this.request("/v1/logs/search", { method: "GET" });
  }

  revokeKey(id: string): Promise<unknown> {
    return this.request(`/v1/account/keys/revoke/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      let envelope: Envelope<T>;
      try {
        envelope = (await response.json()) as Envelope<T>;
      } catch {
        throw new Error(`Infrai returned an unreadable response (${response.status})`);
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          const retryAfter = response.headers.get("Retry-After");
          const milliseconds = retryAfter === null
            ? 250 * 2 ** attempt
            : Math.max(0, Number(retryAfter) * 1000);
          await this.pause(Number.isFinite(milliseconds) ? milliseconds : 250 * 2 ** attempt);
          continue;
        }
        throw new InfraiError(response.status, envelope.error ?? { message: "Request rejected" });
      }

      if (response.status >= 500) {
        throw new Error(`Infrai transport response ${response.status}`);
      }
      return envelope.data as T;
    }
    throw new Error("Retry policy exhausted");
  }
}
