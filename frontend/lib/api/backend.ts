/**
 * Server-only client for the FastAPI administration API.
 *
 * The browser never calls FastAPI directly: server actions attach the
 * signed-in administrator's Supabase access token, and FastAPI re-verifies the
 * JWT and re-checks `profiles.role`. The backend is the only component that
 * holds `SUPABASE_SERVICE_ROLE_KEY`, and it never leaves the server.
 *
 * Do not import this module from a Client Component.
 */

export class BackendError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "BackendError";
    this.status = status;
  }
}

interface BackendRequest {
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  accessToken: string;
  body?: unknown;
}

function backendBaseUrl(): string {
  const configured = process.env.API_BASE_URL?.trim();
  return (configured || "http://localhost:8000").replace(/\/+$/, "");
}

/** Extracts a human-readable message from FastAPI's error envelope. */
function readErrorMessage(payload: unknown, status: number): string {
  if (typeof payload === "string" && payload.trim()) return payload;

  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail: unknown }).detail;

    if (typeof detail === "string" && detail.trim()) return detail;

    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => {
          if (item && typeof item === "object" && "msg" in item) {
            const message = String((item as { msg: unknown }).msg);
            // Pydantic prefixes model-validator failures with "Value error, ".
            return message.replace(/^Value error,\s*/i, "");
          }
          return null;
        })
        .filter((message): message is string => Boolean(message));

      if (messages.length > 0) return messages.join(" ");
    }
  }

  return `The administration service rejected the request (HTTP ${status}).`;
}

export async function callBackend<T>(
  path: string,
  { method, accessToken, body }: BackendRequest,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${backendBaseUrl()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new BackendError(
      503,
      "The administration service is unreachable. Start the FastAPI backend " +
        "on port 8000 and try again.",
    );
  }

  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new BackendError(
      response.status,
      readErrorMessage(payload, response.status),
    );
  }

  return payload as T;
}
