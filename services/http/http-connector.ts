import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/encryption";
import { AppError } from "@/lib/errors";

type HttpConfig = {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH";
  headers?: Record<string, string>;
  authHeader?: string;
  responseMapping?: Record<string, string>;
};

const MAX_HTTP_RESPONSE_BYTES = 1_000_000; // 1 MB cap

/** SSRF guard: only public HTTPS hosts. Blocks localhost, private ranges,
 *  link-local (cloud metadata 169.254.169.254), and internal DNS names. */
function assertPublicHttpsUrl(raw: string): URL {
  let endpoint: URL;
  try {
    endpoint = new URL(raw);
  } catch {
    throw new AppError("HTTP integration has an invalid URL.", "HTTP_MISCONFIGURED");
  }
  if (endpoint.protocol !== "https:") {
    throw new AppError("HTTP integration URL must use https.", "HTTP_MISCONFIGURED");
  }
  const host = endpoint.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "metadata.google.internal" ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    host.endsWith(".localhost")
  ) {
    throw new AppError("HTTP integration host is not allowed.", "HTTP_MISCONFIGURED");
  }
  // IPv4 literal checks (covers 127/10/172.16-31/192.168/169.254/0.0.0.0).
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0) {
      throw new AppError("HTTP integration host is not allowed.", "HTTP_MISCONFIGURED");
    }
  }
  if (host === "::1" || host === "[::1]" || host.startsWith("fd") || host.startsWith("fe80")) {
    throw new AppError("HTTP integration host is not allowed.", "HTTP_MISCONFIGURED");
  }
  if (endpoint.username || endpoint.password) {
    throw new AppError("HTTP integration URL must not embed credentials.", "HTTP_MISCONFIGURED");
  }
  return endpoint;
}

export async function executeHttpRequest(
  organizationId: string,
  integrationName: string,
  parameters: Record<string, unknown>,
) {
  const integration = await db.integration.findFirst({
    where: { organizationId, provider: "HTTP", name: integrationName, enabled: true },
  });
  if (!integration) {
    throw new AppError("HTTP integration not found or disabled.", "HTTP_NOT_FOUND", 404);
  }
  const config = (integration.config || {}) as HttpConfig;
  if (!config.url || !config.method) {
    throw new AppError("HTTP integration is missing URL or method.", "HTTP_MISCONFIGURED");
  }

  let authValue: string | undefined;
  const cred = await db.apiCredential.findFirst({
    where: { organizationId, provider: `http:${integration.id}` },
  });
  if (cred) authValue = decryptSecret(cred.encryptedValue);

  const headers: Record<string, string> = { ...(config.headers || {}) };
  if (authValue) headers[config.authHeader || "Authorization"] = authValue;
  if (!headers["Content-Type"] && config.method !== "GET") headers["Content-Type"] = "application/json";

  const endpoint = assertPublicHttpsUrl(config.url);
  if (config.method === "GET") {
    for (const [k, v] of Object.entries(parameters)) endpoint.searchParams.set(k, String(v));
  }

  let res: Response;
  try {
    res = await fetch(endpoint.toString(), {
      method: config.method,
      headers,
      body: config.method === "GET" ? undefined : JSON.stringify(parameters),
      signal: AbortSignal.timeout(15000),
      redirect: "manual",
    });
  } catch (error) {
    throw new AppError(
      error instanceof Error && error.name === "TimeoutError"
        ? "Configured HTTP request timed out after 15s."
        : "Configured HTTP request failed to connect.",
      "HTTP_REQUEST_FAILED",
      502,
    );
  }
  // Reject redirects (an allow-listed URL must not bounce to an internal host).
  if (res.status >= 300 && res.status < 400) {
    throw new AppError("Configured HTTP request returned a redirect, which is not allowed.", "HTTP_REQUEST_FAILED", 502);
  }
  // Read the body exactly once, then try to parse it as JSON.
  const text = await res.text().catch(() => "");
  if (text.length > MAX_HTTP_RESPONSE_BYTES) {
    throw new AppError("Configured HTTP response was too large.", "HTTP_REQUEST_FAILED", 502);
  }
  let json: unknown = text;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // keep raw text
  }
  if (!res.ok) {
    const detail = typeof text === "string" && text ? `: ${text.slice(0, 300)}` : "";
    throw new AppError(`Configured HTTP request failed (status ${res.status})${detail}`, "HTTP_REQUEST_FAILED", 502);
  }
  // responseMapping lets a workflow pull values out of the response, e.g.
  // { "orderId": "data.order.id" } merges { orderId } into the workflow context.
  const mapped: Record<string, unknown> = {};
  for (const [outKey, path] of Object.entries(config.responseMapping || {})) {
    mapped[outKey] = pickPath(json, path);
  }
  return { status: res.status, data: json, ...mapped };
}

function pickPath(obj: unknown, path: string): unknown {
  if (!path) return undefined;
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        typeof acc === "object" && acc !== null ? (acc as Record<string, unknown>)[key] : undefined,
      obj,
    );
}
