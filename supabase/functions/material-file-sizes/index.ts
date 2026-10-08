import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSignedUrl } from "https://deno.land/x/aws_s3_presign@2.2.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  token: string;
  creatorName: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const { token, creatorName } = (await req.json()) as Body;
    if (!token || !creatorName) {
      return new Response(JSON.stringify({ error: "missing_auth" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: session } = await supabase
      .from("creator_sessions")
      .select("creator_name")
      .eq("token", token)
      .eq("creator_name", creatorName)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!session) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: account } = await supabase
      .from("creator_accounts")
      .select("id")
      .ilike("login", creatorName)
      .maybeSingle();

    const { data: products } = await supabase
      .from("products")
      .select("id")
      .eq("creator_account_id", account?.id ?? "00000000-0000-0000-0000-000000000000");
    const productIds = (products ?? []).map((p) => p.id);
    if (productIds.length === 0) {
      return new Response(JSON.stringify({ updated: 0, total: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Materials missing size in either the current S3 storage or legacy
    // Supabase Storage.
    const { data: rows } = await supabase
      .from("materials")
      .select("id, file_url")
      .in("product_id", productIds)
      .eq("type", "file")
      .is("file_size", null)
      .not("file_url", "is", null)
      .limit(500);

    const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID") || "";
    const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY") || "";
    const region = Deno.env.get("AWS_S3_REGION") || "";

    let updated = 0;
    const list = rows ?? [];

    const sizeFromResponse = (resp: Response): number | null => {
      if (resp.status === 206) {
        const contentRange = resp.headers.get("content-range");
        const total = Number(contentRange?.split("/")[1]);
        if (Number.isFinite(total)) return total;
      }
      const rawContentLength = resp.headers.get("content-length");
      if (!rawContentLength) return null;
      const contentLength = Number(rawContentLength);
      return Number.isFinite(contentLength) ? contentLength : null;
    };

    const head = async (file_url: string): Promise<number | null> => {
      const withoutPrefix = file_url.substring(5);
      const slashIndex = withoutPrefix.indexOf("/");
      if (slashIndex < 0) return null;
      const bucket = withoutPrefix.substring(0, slashIndex);
      const key = withoutPrefix.substring(slashIndex + 1);
      if (!accessKeyId || !secretAccessKey || !region) return null;
      const url = getSignedUrl({
        accessKeyId,
        secretAccessKey,
        bucket,
        key: "/" + key,
        region,
        expiresIn: 300,
      });
      try {
        const resp = await fetch(url, {
          method: "GET",
          headers: { Range: "bytes=0-0" },
        });
        if (resp.ok) return sizeFromResponse(resp);
        try { resp.body?.cancel(); } catch (_) { /* ignore */ }
      } catch (e) {
        console.error("head failed", file_url, e);
      }
      return null;
    };

    const legacyStoragePath = (fileUrl: string): string | null => {
      if (!fileUrl || fileUrl.startsWith("s3://")) return null;
      const marker = "/materials/";
      const markerIndex = fileUrl.indexOf(marker);
      const raw = markerIndex >= 0 ? fileUrl.slice(markerIndex + marker.length) : fileUrl;
      try {
        return decodeURIComponent(raw.split("?")[0]).replace(/^\/+/, "") || null;
      } catch {
        return raw.split("?")[0].replace(/^\/+/, "") || null;
      }
    };

    const legacySize = async (fileUrl: string): Promise<number | null> => {
      const path = legacyStoragePath(fileUrl);
      if (!path) return null;
      const { data, error } = await supabase.storage.from("materials").createSignedUrl(path, 60);
      if (error || !data?.signedUrl) return null;
      try {
        const resp = await fetch(data.signedUrl, {
          method: "GET",
          headers: { Range: "bytes=0-0" },
        });
        const size = resp.ok ? sizeFromResponse(resp) : null;
        try { await resp.body?.cancel(); } catch (_) { /* ignore */ }
        return size;
      } catch (e) {
        console.error("legacy size lookup failed", path, e);
        return null;
      }
    };

    const resolveSize = (fileUrl: string) =>
      fileUrl.startsWith("s3://") ? head(fileUrl) : legacySize(fileUrl);

    // Process in small parallel batches
    const concurrency = 6;
    for (let i = 0; i < list.length; i += concurrency) {
      const chunk = list.slice(i, i + concurrency);
      const results = await Promise.all(
        chunk.map(async (r) => ({ id: r.id, size: await resolveSize(r.file_url!) })),
      );
      const toUpdate = results.filter((x) => x.size !== null);
      await Promise.all(
        toUpdate.map((x) =>
          supabase
            .from("materials")
            .update({ file_size: x.size })
            .eq("id", x.id),
        ),
      );
      updated += toUpdate.length;
    }

    return new Response(
      JSON.stringify({ updated, total: list.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
