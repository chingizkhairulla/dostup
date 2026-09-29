import { json, optionsResponse } from '../_shared/http.ts'
import { CATALOG_COLUMNS, serviceClient } from '../_shared/session.ts'

type CatalogRow = Record<string, unknown> & {
  creator_account_id?: string | null
}

async function withAuthors(
  supabase: ReturnType<typeof serviceClient>,
  rows: CatalogRow[],
) {
  const ids = [...new Set(
    rows
      .map((row) => row.creator_account_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  )]
  const sellerById = new Map<string, {
    display_name: string | null
    handle: string | null
    avatar_url: string | null
    type: string | null
  }>()
  if (ids.length) {
    const { data: accounts } = await supabase
      .from('creator_accounts')
      .select('id, display_name, profiles(handle, display_name, avatar_url, type)')
      .in('id', ids)
    for (const account of accounts ?? []) {
      const profile = Array.isArray(account.profiles) ? account.profiles[0] : account.profiles
      sellerById.set(account.id, {
        display_name: (profile?.display_name || account.display_name) ?? null,
        handle: profile?.handle ?? null,
        avatar_url: profile?.avatar_url ?? null,
        type: profile?.type ?? null,
      })
    }
  }
  return rows.map((row) => {
    const seller = (row.creator_account_id && sellerById.get(row.creator_account_id)) || null
    return {
      ...row,
      author_name: seller?.display_name ?? null,
      seller_handle: seller?.handle ?? null,
      seller_avatar_url: seller?.avatar_url ?? null,
      seller_type: seller?.type ?? null,
    }
  })
}

async function withCategorySlugs(
  supabase: ReturnType<typeof serviceClient>,
  rows: CatalogRow[],
) {
  const categoryIds = [...new Set(
    rows
      .map((row) => row.category_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  )]
  const slugById = new Map<string, string>()
  if (categoryIds.length) {
    const { data: categories } = await supabase
      .from('categories')
      .select('id, slug')
      .in('id', categoryIds)
    for (const cat of categories ?? []) {
      slugById.set(cat.id, cat.slug)
    }
  }
  return rows.map((row) => ({
    ...row,
    category_slug: typeof row.category_id === 'string' ? slugById.get(row.category_id) ?? null : null,
  }))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  try {
    const body = await req.json().catch(() => ({}))
    const action = typeof body.action === 'string' ? body.action : 'get_product'
    const supabase = serviceClient()

    if (action === 'list_products') {
      const { data, error } = await supabase
        .from('products')
        .select(CATALOG_COLUMNS)
        .eq('is_active', true)
        .eq('is_paused', false)
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) return json({ error: error.message }, 500)
      const withSlugs = await withCategorySlugs(supabase, (data ?? []) as CatalogRow[])
      const products = await withAuthors(supabase, withSlugs)
      return json({ products })
    }

    if (action === 'get_product') {
      const idOrSlug = String(body.idOrSlug || body.productId || '').trim()
      if (!idOrSlug) return json({ error: 'Missing product' }, 400)

      const byPublicSlug = await supabase
        .from('public_products')
        .select('id')
        .eq('slug', idOrSlug)
        .maybeSingle()
      const byPublicId = byPublicSlug.data?.id
        ? byPublicSlug
        : await supabase
          .from('public_products')
          .select('id')
          .eq('id', idOrSlug)
          .maybeSingle()
      const catalogId = (byPublicSlug.data?.id || byPublicId.data?.id) as string | undefined

      let data: CatalogRow | null = null
      if (catalogId) {
        const result = await supabase
          .from('products')
          .select(CATALOG_COLUMNS)
          .eq('id', catalogId)
          .eq('is_active', true)
          .maybeSingle()
        data = result.data as CatalogRow | null
      }

      if (!data) {
        const bySlug = await supabase
          .from('products')
          .select(CATALOG_COLUMNS)
          .eq('slug', idOrSlug)
          .eq('is_active', true)
          .maybeSingle()
        data = bySlug.data as CatalogRow | null
      }

      if (!data) {
        const byId = await supabase
          .from('products')
          .select(CATALOG_COLUMNS)
          .eq('id', idOrSlug)
          .eq('is_active', true)
          .maybeSingle()
        data = byId.data as CatalogRow | null
      }

      if (!data) return json({ product: null })
      const [withSlug] = await withCategorySlugs(supabase, [data])
      const [product] = await withAuthors(supabase, [withSlug])
      return json({ product })
    }

    if (action === 'list_program') {
      const productId = String(body.productId || body.idOrSlug || '').trim()
      if (!productId) return json({ items: [] })

      const { data: product } = await supabase
        .from('products')
        .select('id')
        .eq('id', productId)
        .eq('is_active', true)
        .maybeSingle()
      if (!product) return json({ items: [] })

      const { data, error } = await supabase
        .from('materials')
        .select('id, title, type, parent_id, order_index')
        .eq('product_id', productId)
        .is('teacher_id', null)
        .is('deleted_at', null)
        .order('order_index', { ascending: true })
        .limit(500)
      if (error) return json({ error: error.message }, 500)
      return json({ items: data ?? [] })
    }

    if (action === 'list_teachers') {
      const productId = String(body.productId || '').trim()
      if (!productId) return json({ error: 'Missing productId' }, 400)
      const { data: product } = await supabase
        .from('products')
        .select('id')
        .eq('id', productId)
        .eq('is_active', true)
        .maybeSingle()
      if (!product) return json({ teachers: [] })
      const { data } = await supabase
        .from('product_teachers')
        .select('*')
        .eq('product_id', productId)
        .order('created_at')
      return json({ teachers: data ?? [] })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    console.error('catalog error', e)
    return json({ error: 'Internal error' }, 500)
  }
})
