import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-dostup-session, x-creator-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { action, creatorName, creatorToken, productId, id, contentHtml, ids, groupLinkUrl, groupLinkLabel } =
      await req.json()

    if (!action || !creatorName || !creatorToken) {
      return json({ error: 'Missing action / creatorName / creatorToken' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: session } = await supabase
      .from('creator_sessions')
      .select('id')
      .eq('token', creatorToken)
      .eq('creator_name', creatorName)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (!session) return json({ error: 'Unauthorized' }, 401)

    const { data: account } = await supabase
      .from('creator_accounts')
      .select('id, login')
      .ilike('login', creatorName)
      .maybeSingle()
    if (!account) return json({ error: 'Unauthorized' }, 401)

    const ensureOwnsProduct = async (pid: string) => {
      const { data: p } = await supabase.from('products').select('id, creator_account_id').eq('id', pid).maybeSingle()
      return !!p && p.creator_account_id === account.id
    }

    if (action === 'create') {
      if (!productId || typeof contentHtml !== 'string') return json({ error: 'Bad input' }, 400)
      if (!(await ensureOwnsProduct(productId))) return json({ error: 'Forbidden' }, 403)
      const { data: maxRow } = await supabase
        .from('announcements')
        .select('order_index')
        .eq('product_id', productId)
        .order('order_index', { ascending: false })
        .limit(1)
        .maybeSingle()
      const nextIndex = (maxRow?.order_index ?? -1) + 1
      const { data, error } = await supabase
        .from('announcements')
        .insert({ product_id: productId, creator_id: account.login, content_html: contentHtml, order_index: nextIndex })
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)
      return json({ announcement: data })
    }

    if (action === 'update') {
      if (!id || typeof contentHtml !== 'string') return json({ error: 'Bad input' }, 400)
      const { data: existing } = await supabase.from('announcements').select('product_id').eq('id', id).maybeSingle()
      if (!existing || !(await ensureOwnsProduct(existing.product_id))) return json({ error: 'Forbidden' }, 403)
      const { data, error } = await supabase
        .from('announcements')
        .update({ content_html: contentHtml })
        .eq('id', id)
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)
      return json({ announcement: data })
    }

    if (action === 'delete') {
      if (!id) return json({ error: 'Bad input' }, 400)
      const { data: existing } = await supabase.from('announcements').select('product_id').eq('id', id).maybeSingle()
      if (!existing || !(await ensureOwnsProduct(existing.product_id))) return json({ error: 'Forbidden' }, 403)
      const { error } = await supabase.from('announcements').delete().eq('id', id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    if (action === 'reorder') {
      if (!productId || !Array.isArray(ids)) return json({ error: 'Bad input' }, 400)
      if (!(await ensureOwnsProduct(productId))) return json({ error: 'Forbidden' }, 403)
      for (let i = 0; i < ids.length; i++) {
        await supabase.from('announcements').update({ order_index: i }).eq('id', ids[i]).eq('product_id', productId)
      }
      return json({ ok: true })
    }

    if (action === 'set_group_link') {
      if (!productId) return json({ error: 'Bad input' }, 400)
      if (!(await ensureOwnsProduct(productId))) return json({ error: 'Forbidden' }, 403)
      const { error } = await supabase
        .from('products')
        .update({
          telegram_link: groupLinkUrl ?? null,
          group_link_label: groupLinkLabel ?? null,
        })
        .eq('id', productId)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    console.error('manage-announcements error', e)
    return json({ error: 'Internal error' }, 500)
  }
})
