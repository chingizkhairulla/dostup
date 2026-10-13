import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_URL = "https://www.trydostup.online"
const DEFAULT_IMAGE = "https://www.trydostup.online/og-image.png"

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const productId = url.searchParams.get('id')
    const teacher = url.searchParams.get('teacher')

    let redirectUrl = `${APP_URL}/p/${productId || ''}`
    if (teacher) {
      redirectUrl += `?teacher=${encodeURIComponent(teacher)}`
    }

    if (!productId) {
      return new Response(null, {
        status: 302,
        headers: { Location: redirectUrl, ...corsHeaders },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }

    let product: any = null

    const slugRes = await fetch(
      `${supabaseUrl}/rest/v1/products?slug=eq.${encodeURIComponent(productId)}&is_active=eq.true&select=title,headline,description,price,image_url&limit=1`,
      { headers }
    )
    const slugData = await slugRes.json()
    if (Array.isArray(slugData) && slugData.length > 0) {
      product = slugData[0]
    } else {
      const idRes = await fetch(
        `${supabaseUrl}/rest/v1/products?id=eq.${encodeURIComponent(productId)}&is_active=eq.true&select=title,headline,description,price,image_url&limit=1`,
        { headers }
      )
      const idData = await idRes.json()
      if (Array.isArray(idData) && idData.length > 0) {
        product = idData[0]
      }
    }

    const title = product?.title || 'Dostup'
    const desc = product?.headline || product?.description || ''
    const image = product?.image_url || DEFAULT_IMAGE
    const price = product?.price ? `${product.price} ₸` : ''
    const ogDesc = price ? `${desc} — ${price}` : (desc || 'Платформа для проведения уроков и продажи курсов!')

    const e = (s: string) => s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

    const html = `<!DOCTYPE html><html lang="ru"><head>
<meta charset="UTF-8"/>
<meta property="og:type" content="product"/>
<meta property="og:title" content="${e(title)}"/>
<meta property="og:description" content="${e(ogDesc)}"/>
<meta property="og:image" content="${e(image)}"/>
<meta property="og:url" content="${e(redirectUrl)}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${e(title)}"/>
<meta name="twitter:description" content="${e(ogDesc)}"/>
<meta name="twitter:image" content="${e(image)}"/>
<meta http-equiv="refresh" content="0;url=${e(redirectUrl)}"/>
<title>${e(title)}</title>
</head><body>
<script>window.location.href="${redirectUrl.replace(/\\/g,'\\\\').replace(/"/g,'\\"')}";</script>
</body></html>`

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300', ...corsHeaders },
    })
  } catch (err) {
    console.error('og-product error:', err)
    return new Response('Internal error', { status: 500, headers: corsHeaders })
  }
})
