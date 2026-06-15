import { loadConfig } from "./config.js";
import { log } from "./output.js";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type QueryValue = string | number | boolean | null | undefined;

export interface ListMessagesOptions {
  cursor?: string;
  from?: string;
  provider?: string;
  type?: "received" | "sent";
}

function withQuery(path: string, params: Record<string, QueryValue>): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

async function request(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const config = loadConfig();

  if (!config.apiUrl) {
    log("Error: API URL not configured. Run: moemail config set api-url <url>");
    process.exit(2);
  }
  if (!config.apiKey) {
    log("Error: API Key not configured. Run: moemail config set api-key <key>");
    process.exit(2);
  }

  const url = `${config.apiUrl.replace(/\/$/, "")}${path}`;
  const headers: Record<string, string> = {
    "X-API-Key": config.apiKey,
  };
  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 || res.status === 403) {
    log("Error: Authentication failed. Check your API Key.");
    process.exit(2);
  }

  if (res.status === 204) {
    return null;
  }

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(res.status, (data as any).error || `HTTP ${res.status}`);
  }

  return data;
}

export const api = {
  getConfig: () => request("GET", "/api/config"),

  createEmail: (body: { name?: string; expiryTime: number; domain: string }) =>
    request("POST", "/api/emails/generate", body as any),

  listEmails: (cursor?: string) =>
    request("GET", withQuery("/api/emails", { cursor })),

  listMessages: (emailId: string, options: string | ListMessagesOptions = {}) => {
    const params = typeof options === "string" ? { cursor: options } : options;
    return request("GET", withQuery(`/api/emails/${emailId}`, {
      cursor: params.cursor,
      from: params.from,
      provider: params.provider,
      type: params.type,
    }));
  },

  getMessage: (emailId: string, messageId: string) =>
    request("GET", `/api/emails/${emailId}/${messageId}`),

  deleteEmail: (emailId: string) =>
    request("DELETE", `/api/emails/${emailId}`),

  deleteMessage: (emailId: string, messageId: string) =>
    request("DELETE", `/api/emails/${emailId}/${messageId}`),

  sendEmail: (emailId: string, body: { to: string; subject: string; content: string }) =>
    request("POST", `/api/emails/${emailId}/send`, body),
};
