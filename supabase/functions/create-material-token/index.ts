import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buyerCanOpenMaterial } from "../_shared/subscription.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GENERIC_ERROR = 'Access denied';

function deny(): Response {
  return new Response(
    JSON.stringify({ error: GENERIC_ERROR }),
    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

function extractProductId(path: string): string | null {
  let relativePath = path;
  if (relativePath.startsWith('s3://')) {
    const withoutPrefix = relativePath.substring(5);
    const slashIndex = withoutPrefix.indexOf('/');
    relativePath = withoutPrefix.substring(slashIndex + 1);
  }

  const pathParts = relativePath.split('/');
  if (pathParts[0]?.startsWith('teacher-')) {
    return pathParts[1] || null;
  }
  return pathParts[0] || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const path = typeof body?.path === 'string' ? body.path : '';
    const creatorToken = typeof body?.creatorToken === 'string' ? body.creatorToken : '';
    const creatorName = typeof body?.creatorName === 'string' ? body.creatorName.trim() : '';
    const sessionToken = typeof body?.sessionToken === 'string' ? body.sessionToken : '';

    const productId = extractProductId(path);
    if (!path || !productId) {
      return deny();
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let authorized = false;

    if (creatorToken && creatorName) {
      const { data: session } = await supabase
        .from('creator_sessions')
        .select('id')
        .eq('token', creatorToken)
        .eq('creator_name', creatorName)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (session) {
        const { data: account } = await supabase
          .from('creator_accounts')
          .select('id')
          .ilike('login', creatorName)
          .maybeSingle();
        const { data: product } = await supabase
          .from('products')
          .select('id')
          .eq('id', productId)
          .eq('creator_account_id', account?.id ?? '00000000-0000-0000-0000-000000000000')
          .maybeSingle();

        if (product) {
          authorized = true;
        }
      }
    } else if (sessionToken) {
      const { data: session } = await supabase
        .from('creator_sessions')
        .select('profile_id')
        .eq('token', sessionToken)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (session?.profile_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, type, display_name')
          .eq('id', session.profile_id)
          .maybeSingle();

        if (profile?.type === 'buyer') {
          if (await buyerCanOpenMaterial(supabase, profile.id, productId, { path })) {
            authorized = true;
          }
        }
      }
    }

    if (!authorized) {
      return deny();
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insertError } = await supabase
      .from('material_access_tokens')
      .insert({
        token,
        file_path: path,
        expires_at: expiresAt,
        used: false,
      });

    if (insertError) {
      console.error('Error creating token:', insertError);
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ token }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error in create-material-token:', error);
    return deny();
  }
});
