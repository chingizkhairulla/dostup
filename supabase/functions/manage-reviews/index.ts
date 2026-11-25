import { json, optionsResponse } from '../_shared/http.ts'
import { resolveUser, serviceClient } from '../_shared/session.ts'
import { buyerCanReviewProduct } from '../_shared/subscription.ts'

const MAX_COMMENT_LENGTH = 2000

function ratingSummary(rows: Array<{ rating: number }>) {
  const reviewCount = rows.length
  const avgRating = reviewCount
    ? Math.round((rows.reduce((sum, r) => sum + r.rating, 0) / reviewCount) * 100) / 100
    : 0
  return { avgRating, reviewCount }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  try {
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || 'list')
    const supabase = serviceClient()
    const productId = String(body.productId || '').trim()
    if (!productId) return json({ error: 'Missing productId' }, 400)

    if (action === 'list') {
      const { data: reviews, error } = await supabase
        .from('product_reviews_public')
        .select('id, rating, comment, created_at, buyer_display_name, buyer_avatar_url')
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
      if (error) return json({ error: error.message }, 500)

      const { avgRating, reviewCount } = ratingSummary(reviews ?? [])

      let myReview: { rating: number; comment: string | null } | null = null
      let canReview = false
      const token = String(body.sessionToken || body.token || '')
      if (token) {
        const caller = await resolveUser(supabase, token)
        if (caller) {
          const { data: mine } = await supabase
            .from('product_reviews')
            .select('rating, comment')
            .eq('product_id', productId)
            .eq('buyer_profile_id', caller.userId)
            .maybeSingle()
          myReview = mine ?? null
          canReview = await buyerCanReviewProduct(supabase, caller.userId, productId)
        }
      }

      return json({ reviews: reviews ?? [], avgRating, reviewCount, myReview, canReview })
    }

    if (action === 'upsert') {
      const token = String(body.sessionToken || body.token || '')
      const caller = await resolveUser(supabase, token)
      if (!caller) return json({ error: 'Unauthorized' }, 401)

      const rating = Math.round(Number(body.rating))
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
        return json({ error: 'Rating must be between 1 and 5' }, 400)
      }
      const comment = String(body.comment || '').trim().slice(0, MAX_COMMENT_LENGTH) || null

      const canReview = await buyerCanReviewProduct(supabase, caller.userId, productId)
      if (!canReview) return json({ error: 'Purchase required to leave a review' }, 403)

      const { error: upsertError } = await supabase
        .from('product_reviews')
        .upsert(
          {
            product_id: productId,
            buyer_profile_id: caller.userId,
            rating,
            comment,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'product_id,buyer_profile_id' },
        )
      if (upsertError) return json({ error: upsertError.message }, 500)

      const { data: reviews, error } = await supabase
        .from('product_reviews_public')
        .select('id, rating, comment, created_at, buyer_display_name, buyer_avatar_url')
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
      if (error) return json({ error: error.message }, 500)

      const { avgRating, reviewCount } = ratingSummary(reviews ?? [])
      return json({
        reviews: reviews ?? [],
        avgRating,
        reviewCount,
        myReview: { rating, comment },
        canReview: true,
      })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (error) {
    console.error('Error in manage-reviews:', error)
    return json({ error: 'Internal server error' }, 500)
  }
})
