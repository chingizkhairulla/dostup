import { json, optionsResponse } from '../_shared/http.ts'
import { serviceClient } from '../_shared/session.ts'
import { subscriptionGrantsAccess, type SubscriptionRow } from '../_shared/subscription.ts'
import { appBaseUrl, sendTransactionalEmail } from '../_shared/transactional-email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function formatDateRu(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso))
}

async function buyerEmail(
  supabase: ReturnType<typeof serviceClient>,
  profileId: string,
): Promise<string | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('auth_user_id')
    .eq('id', profileId)
    .maybeSingle()
  if (!profile?.auth_user_id) return null
  const { data, error } = await supabase.auth.admin.getUserById(profile.auth_user_id)
  if (error || !data.user?.email) return null
  return data.user.email
}

async function sendRenewalPush(
  supabase: ReturnType<typeof serviceClient>,
  profileId: string,
  title: string,
  body: string,
  productId: string,
): Promise<void> {
  const { error } = await supabase.functions.invoke('send-push-notification', {
    body: {
      userId: profileId,
      title,
      body,
      data: {
        type: 'subscription_payment_reminder',
        productId,
        url: `/dashboard?highlight=${encodeURIComponent(productId)}`,
      },
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

    let remindersSent = 0
    let expired = 0

    // Check active subscriptions ending soon
    const maxHorizon = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString()
    const { data: reminderCandidates, error: reminderError } = await supabase
      .from('subscriptions')
      .select('id, product_id, buyer_profile_id, current_period_end, status, renewal_reminder_sent_at')
      .eq('status', 'active')
      .gte('current_period_end', now.toISOString())
      .lte('current_period_end', maxHorizon)

    if (reminderError) throw reminderError

    const baseUrl = appBaseUrl()

    for (const sub of (reminderCandidates ?? []) as Array<
      Pick<
        SubscriptionRow,
        'id' | 'product_id' | 'buyer_profile_id' | 'current_period_end' | 'renewal_reminder_sent_at'
      >
    >) {
      const msLeft = new Date(sub.current_period_end).getTime() - now.getTime()
      const daysLeft = msLeft / (24 * 60 * 60 * 1000)

      // Fetch user's notification preferences
      const { data: userPref } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', sub.buyer_profile_id)
        .maybeSingle()

      const wantsWeek = userPref?.payment_reminder_week ?? true
      const wantsDay = userPref?.payment_reminder_day ?? true

      // Determine if a reminder should be triggered now
      const isWeekWindow = daysLeft <= 7.05 && daysLeft >= 6.0 && wantsWeek
      const isDayWindow = daysLeft <= 1.05 && daysLeft >= 0.0 && wantsDay

      if (!isWeekWindow && !isDayWindow) continue

      // Avoid duplicate reminder for the same window on the same day
      const lastSent = sub.renewal_reminder_sent_at ? new Date(sub.renewal_reminder_sent_at) : null
      if (lastSent && now.getTime() - lastSent.getTime() < 18 * 60 * 60 * 1000) {
        continue
      }

      const { data: product } = await supabase
        .from('products')
        .select('id, title, slug')
        .eq('id', sub.product_id)
        .maybeSingle()
      if (!product) continue

      const paymentUrl = `${baseUrl}/checkout/${encodeURIComponent(product.slug || product.id)}`
      const endLabel = formatDateRu(sub.current_period_end)
      const title = 'Скоро оплата!'
      const body = `${product.title}: оплатите следующий период до ${endLabel}`

      await sendRenewalPush(supabase, sub.buyer_profile_id, title, body, sub.product_id)

      const email = await buyerEmail(supabase, sub.buyer_profile_id)
      if (email) {
        await sendTransactionalEmail({
          to: email,
          subject: title,
          html: `
            <p>Здравствуйте!</p>
            <p>Подписка на «${product.title}» заканчивается ${endLabel}.</p>
            <p>Оплатите следующий период, чтобы сохранить доступ:</p>
            <p><a href="${paymentUrl}">${paymentUrl}</a></p>
            <p>Доступ продолжается, пока вы оплачиваете подписку.</p>
          `,
        })
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
