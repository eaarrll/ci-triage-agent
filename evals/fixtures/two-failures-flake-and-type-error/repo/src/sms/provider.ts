const DEFAULT_TIMEOUT_MS = 10_000;

export interface SmsResult {
  id: string;
  status: "queued" | "sent" | "failed";
}

export class SmsProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  async send(to: string, body: string): Promise<SmsResult> {
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify({ to, body }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`SMS provider returned ${res.status}`);
    return (await res.json()) as SmsResult;
  }

  async status(id: string): Promise<SmsResult> {
    const res = await fetch(`${this.baseUrl}/v1/messages/${id}`, {
      headers: { authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`SMS provider returned ${res.status}`);
    return (await res.json()) as SmsResult;
  }
}

export function smsProvider(): SmsProvider {
  return new SmsProvider(process.env.SMS_SANDBOX_URL ?? "https://sms.example.net", process.env.SMS_API_TOKEN ?? "");
}
