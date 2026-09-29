import { supabase } from "@/integrations/supabase/client";

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

  let lastError: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }

      const { data, error } = await supabase.functions.invoke(fn, {
        body: enrichedBody,
        headers,
      });

      if (error) {
        let msg = error.message;
        try {
          if ("context" in error && typeof (error as any).context?.json === "function") {
            const errJson = await (error as any).context.json();
            if (errJson?.error) msg = String(errJson.error);
          }
        } catch {
          // ignore
        }

        if (msg.includes("Failed to send a request") && attempt < retries) {
          lastError = new Error(msg);
          continue;
        }

        if (msg.includes("Failed to send a request")) {
          throw new Error("Не удалось связаться с сервером. Пожалуйста, проверьте подключение к интернету или обновите страницу.");
        }

        throw new Error(msg);
      }

      if (data && typeof data === "object" && "error" in data && (data as { error?: unknown }).error) {
        throw new Error(String((data as { error: unknown }).error));
      }

      return data as T;
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || "";
      if (errMsg.includes("Failed to send a request") && attempt < retries) {
        continue;
      }
      if (errMsg.includes("Failed to send a request")) {
        throw new Error("Не удалось связаться с сервером. Пожалуйста, проверьте подключение к интернету или обновите страницу.");
      }
      throw err;
    }
  }

  throw lastError || new Error("Не удалось связаться с сервером.");
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

export async function getReceiptSignedUrl(submissionId: string, isCreator = false): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authPayload = isCreator ? creatorCreds() : studentCreds();
  const res = await fetch(`${supabaseUrl}/functions/v1/payment-receipt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ ...authPayload, submissionId }),
  });
  if (!res.ok) throw new Error("Failed to get receipt URL");
  const data = await res.json();
  return data.url;
}

export async function fetchCreatorReceiptBlob(submissionId: string): Promise<Blob> {
  try {
    const url = await getReceiptSignedUrl(submissionId, true);
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load receipt file from signed URL");
    return await res.blob();
  } catch (err) {
    // Fallback: direct blob download via wantsBlob
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
      body: JSON.stringify({ ...creatorCreds(), submissionId, wantsBlob: true }),
    });
    if (!res.ok) throw new Error("Failed to load receipt");
    return res.blob();
  }
}

