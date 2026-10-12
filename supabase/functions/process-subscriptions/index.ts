import { json, optionsResponse } from '../_shared/http.ts'
import { serviceClient } from '../_shared/session.ts'
import { subscriptionGrantsAccess, type SubscriptionRow } from '../_shared/subscription.ts'
import { appBaseUrl, sendTransactionalEmail } from '../_shared/transactional-email.ts'
import { email as emails, push, toLang, type Lang, type Localized, type Push } from '../_shared/i18n.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** The buyer's address and the language they last used the app in. */
async function buyerContact(
  supabase: ReturnType<typeof serviceClient>,
  profileId: string,
): Promise<{ email: string; lang: Lang } | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('auth_user_id, language')
    .eq('id', profileId)
    .maybeSingle()
  if (!profile?.auth_user_id) return null
  const { data, error } = await supabase.auth.admin.getUserById(profile.auth_user_id)
  if (error || !data.user?.email) return null
  return { email: data.user.email, lang: toLang(profile.language) }
}

async function sendRenewalPush(
  supabase: ReturnType<typeof serviceClient>,
  profileId: string,
  localized: Localized<Push>,
  productId: string,
): Promise<void> {
  // Russian title/body ride along for an older send-push-notification that only
  // knows those two fields; a current one gives each device its own language.
  const { error } = await supabase.functions.invoke('send-push-notification', {
    body: {
      userId: profileId,
      title: localized.ru.title,
      body: localized.ru.body,
      localized,
      data: { type: 'subscription_renewal', productId },
      targetRole: 'student',
    },
  })
  if (error) console.error('renewal push failed', error)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = serviceClient()
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const reminderDate = new Date(now)
    reminderDate.setDate(reminderDate.getDate() + 3)
    const reminderDay = reminderDate.toISOString().slice(0, 10)

    let remindersSent = 0
    let expired = 0

    const { data: reminderCandidates, error: reminderError } = await supabase
      .from('subscriptions')
      .select('id, product_id, buyer_profile_id, current_period_end, status')
      .eq('status', 'active')
      .is('renewal_reminder_sent_at', null)
      .gte('current_period_end', `${reminderDay}T00:00:00.000Z`)
      .lt('current_period_end', `${reminderDay}T23:59:59.999Z`)

    if (reminderError) throw reminderError

    const baseUrl = appBaseUrl()

    for (const sub of (reminderCandidates ?? []) as Pick<
      SubscriptionRow,
      'id' | 'product_id' | 'buyer_profile_id' | 'current_period_end'
    >[]) {
      const { data: product } = await supabase
        .from('products')
        .select('id, title, slug')
        .eq('id', sub.product_id)
        .maybeSingle()
      if (!product) continue

      const paymentUrl = `${baseUrl}/checkout/${encodeURIComponent(product.slug || product.id)}`
      const renewal = { product: product.title, periodEnd: sub.current_period_end }

      await sendRenewalPush(supabase, sub.buyer_profile_id, push.subscriptionRenewal(renewal), sub.product_id)

      const contact = await buyerContact(supabase, sub.buyer_profile_id)
      if (contact) {
        const message = emails.subscriptionRenewal({ ...renewal, paymentUrl }, contact.lang)
        await sendTransactionalEmail({ to: contact.email, ...message })
      }

      await supabase
        .from('subscriptions')
        .update({ renewal_reminder_sent_at: now.toISOString() })
        .eq('id', sub.id)

      remindersSent++
    }

    const { data: expiring, error: expireError } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('status', 'active')
      .lte('current_period_end', now.toISOString())

    if (expireError) throw expireError

    if (expiring?.length) {
      const { error: updateError } = await supabase
        .from('subscriptions')
        .update({ status: 'past_due' })
        .in('id', expiring.map((r: { id: string }) => r.id))
      if (updateError) throw updateError
      expired = expiring.length
    }

    return new Response(
      JSON.stringify({
        ok: true,
        remindersSent,
        expired,
        processedAt: now.toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('process-subscriptions error', error)
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500)
  }
})
