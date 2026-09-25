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

  let endpoint: URL;
  try {
    endpoint = new URL(config.url);
  } catch {
    throw new AppError("HTTP integration has an invalid URL.", "HTTP_MISCONFIGURED");
  }
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
  // Read the body exactly once, then try to parse it as JSON.
  const text = await res.text().catch(() => "");
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
