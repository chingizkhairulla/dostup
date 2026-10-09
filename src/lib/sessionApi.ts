import { supabase } from "@/integrations/supabase/client";

const CONNECTION_ERROR_MESSAGE = "Не удалось выполнить запрос. Проверьте интернет и попробуйте ещё раз.";
const SERVER_ERROR_MESSAGE = "Сервис временно недоступен. Попробуйте ещё раз немного позже.";

type InvokeErrorDetails = {
  message: string;
  status?: number;
  retryable: boolean;
};

class ApiRequestError extends Error {
  status?: number;
  retryable: boolean;

  constructor({ message, status, retryable }: InvokeErrorDetails) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.retryable = retryable;
  }
}

function isConnectionError(message: string) {
  const normalized = message.toLowerCase();
  return [
    "failed to send a request",
    "failed to fetch",
    "networkerror",
    "network request failed",
    "load failed",
  ].some((fragment) => normalized.includes(fragment));
}

function responseFromError(error: unknown): Response | undefined {
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: unknown }).context;
    if (context && typeof context === "object" && "status" in context && typeof (context as Response).json === "function") {
      return context as Response;
    }
  }
  return undefined;
}

async function describeInvokeError(error: unknown): Promise<InvokeErrorDetails> {
  const response = responseFromError(error);
  const status = response?.status;
  let message = error instanceof Error ? error.message : "";

  if (response) {
    try {
      const payload = await response.clone().json() as { error?: unknown; message?: unknown };
      if (typeof payload.message === "string") message = payload.message;
      else if (typeof payload.error === "string") message = payload.error;
    } catch {
      // Ответ без JSON оставляем с исходным сообщением SDK.
    }
  }

  if (status === 401 || status === 403) {
    return { message: "Сессия истекла. Войдите в аккаунт заново.", status, retryable: false };
  }
  if (status === 429) {
    return { message: "Слишком много запросов. Подождите немного и повторите попытку.", status, retryable: true };
  }
  if (status && status >= 500) {
    return { message: SERVER_ERROR_MESSAGE, status, retryable: true };
  }
  if (isConnectionError(message)) {
    return { message: CONNECTION_ERROR_MESSAGE, status, retryable: true };
  }

  return { message: message || "Не удалось выполнить запрос.", status, retryable: false };
}

function canRetryRequest(fn: string, body: Record<string, unknown>) {
  const action = typeof body.action === "string" ? body.action : "";
  const safeActions = new Set(["list", "get", "get_product", "lookup_teacher", "list_student", "list_all_creator"]);
  return safeActions.has(action) || ["validate-creator-session", "material-file-sizes"].includes(fn);
}

function reportInvokeFailure(fn: string, details: InvokeErrorDetails) {
  // Без тела запроса и токенов: эти данные помогают отличить сбой сети от ответа сервера.
  console.warn("[api] Edge Function request failed", { functionName: fn, status: details.status, retryable: details.retryable });
}

export function creatorCreds() {
  return {
    creatorToken: localStorage.getItem("creator_token") || "",
    creatorName: localStorage.getItem("creator_name") || "",
  };
}

export function studentCreds() {
  const token = localStorage.getItem("creator_token") || localStorage.getItem("simple_session_token") || "";
  return {
    sessionToken: token,
  };
}

export function sessionCreds() {
  const token = localStorage.getItem("creator_token") || "";
  const name = localStorage.getItem("creator_name") || "";
  const profileType = localStorage.getItem("profile_type");
  if (profileType === "buyer") {
    return { sessionToken: token || localStorage.getItem("simple_session_token") || "" };
  }
  if (token && name) {
    return { creatorToken: token, creatorName: name, sessionToken: token };
  }
  return studentCreds();
}

export async function invokeApi<T = Record<string, unknown>>(
  fn: string,
  body: Record<string, unknown> = {},
  retries = 2
): Promise<T> {
  const creatorToken = localStorage.getItem("creator_token") || localStorage.getItem("simple_session_token") || "";

  // Only pass x-creator-token header for functions that require it in headers (e.g. file uploads)
  // to avoid triggering CORS preflight failures on functions that only accept standard headers.
  // The token is already passed in body for all functions.
  const headers: Record<string, string> = {};
  if (creatorToken && (fn === "manage-profile" || fn === "upload-product-media")) {
    headers["x-creator-token"] = creatorToken;
  }

  const enrichedBody: Record<string, unknown> = {
    token: body.token || creatorToken,
    ...body,
  };

  let lastError: Error | null = null;
  const allowedRetries = canRetryRequest(fn, body) ? retries : 0;

  for (let attempt = 0; attempt <= allowedRetries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }

      const { data, error } = await supabase.functions.invoke(fn, {
        body: enrichedBody,
        headers,
      });

      if (error) {
        const details = await describeInvokeError(error);
        reportInvokeFailure(fn, details);
        lastError = new ApiRequestError(details);
        if (details.retryable && attempt < allowedRetries) {
          continue;
        }
        throw lastError;
      }

      if (data && typeof data === "object" && "error" in data && (data as { error?: unknown }).error) {
        throw new Error(String((data as { error: unknown }).error));
      }

      return data as T;
    } catch (err: unknown) {
      if (err instanceof ApiRequestError) throw err;

      const details = await describeInvokeError(err);
      reportInvokeFailure(fn, details);
      lastError = new ApiRequestError(details);
      if (details.retryable && attempt < allowedRetries) {
        continue;
      }
      throw lastError;
    }
  }

  throw lastError || new Error(CONNECTION_ERROR_MESSAGE);
}

export type FunctionFail = {
  ok: false
  stage: string
  code: string
  message: string
}

export class FunctionInvokeError extends Error {
  stage: string
  code: string
  status?: number
  constructor(payload: FunctionFail, status?: number) {
    super(payload.message)
    this.name = "FunctionInvokeError"
    this.stage = payload.stage
    this.code = payload.code
    this.status = status
  }
}

async function readInvokeError(error: unknown, response?: Response): Promise<FunctionFail | null> {
  const res = response || (error && typeof error === "object" && "context" in error
    ? (error as { context?: Response }).context
    : undefined)
  if (res && typeof res.json === "function") {
    try {
      const payload = await res.json() as Record<string, unknown>
      if (typeof payload.message === "string") {
        return {
          ok: false,
          stage: String(payload.stage || "invoke"),
          code: String(payload.code || "INVOKE_FAILED"),
          message: payload.message,
        }
      }
      if (payload.error) {
        return {
          ok: false,
          stage: "invoke",
          code: "INVOKE_FAILED",
          message: String(payload.error),
        }
      }
    } catch {
      /* fall through */
    }
  }
  if (error instanceof Error && error.message) {
    return { ok: false, stage: "invoke", code: "INVOKE_FAILED", message: error.message }
  }
  return null
}

export async function invokeForm<T = Record<string, unknown>>(
  fn: string,
  form: FormData,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const { data, error, response } = await supabase.functions.invoke(fn, {
    body: form,
    headers: extraHeaders,
  });
  if (error) {
    const payload = await readInvokeError(error, response)
    if (payload) throw new FunctionInvokeError(payload, response?.status)
    throw error
  }
  if (data && typeof data === "object" && (data as { ok?: boolean }).ok === false) {
    const fail = data as FunctionFail
    throw new FunctionInvokeError({
      ok: false,
      stage: String(fail.stage || "invoke"),
      code: String(fail.code || "INVOKE_FAILED"),
      message: String(fail.message || fail),
    })
  }
  if (data && typeof data === "object" && "error" in data && (data as { error?: unknown }).error) {
    throw new FunctionInvokeError({
      ok: false,
      stage: "invoke",
      code: "INVOKE_FAILED",
      message: String((data as { error: unknown }).error),
    })
  }
  return data as T;
}

export async function fetchCreatorReceiptBlob(submissionId: string): Promise<Blob> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const res = await fetch(`${supabaseUrl}/functions/v1/payment-receipt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ ...creatorCreds(), submissionId }),
  });
  if (!res.ok) throw new Error("Failed to load receipt");
  return res.blob();
}
