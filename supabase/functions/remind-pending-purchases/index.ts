import { json, optionsResponse } from '../_shared/http.ts'
import { serviceClient } from '../_shared/session.ts'
import { appBaseUrl, sendTransactionalEmail } from '../_shared/transactional-email.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  try {
    const supabase = serviceClient()
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()

    // Find pending purchases older than 6 hours that have not had a reminder sent yet
    const { data: pendingPurchases, error: pError } = await supabase
      .from('simple_purchases')
      .select('id, amount, product_id, created_at, buyer_profile_id, simple_user_id, seller_reminder_sent_at')
      .eq('status', 'pending')
      .lte('created_at', sixHoursAgo)
      .is('seller_reminder_sent_at', null)

    if (pError) {
      console.error('Error fetching pending purchases for reminders:', pError)
      return json({ error: pError.message }, 500)
    }

    if (!pendingPurchases || pendingPurchases.length === 0) {
      return json({ processed: 0, message: 'No purchases pending reminder' })
    }

    let sentCount = 0

    for (const purchase of pendingPurchases) {
      try {
        // Fetch product & creator account
        const { data: prod } = await supabase
          .from('products')
          .select('id, title, creator_account_id')
          .eq('id', purchase.product_id)
          .maybeSingle()

        if (!prod?.creator_account_id) continue

        const { data: creator } = await supabase
          .from('creator_accounts')
          .select('id, login, email, profile_id')
          .eq('id', prod.creator_account_id)
          .maybeSingle()

        if (!creator) continue

        // Fetch buyer display name
        let buyerName = 'Покупатель'
        if (purchase.buyer_profile_id) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', purchase.buyer_profile_id)
            .maybeSingle()
          if (prof?.display_name) buyerName = prof.display_name
        } else if (purchase.simple_user_id) {
          const { data: su } = await supabase
            .from('simple_users')
            .select('name')
            .eq('id', purchase.simple_user_id)
            .maybeSingle()
          if (su?.name) buyerName = su.name
        }

        const sellerProfileId = creator.profile_id || ''
        const checkUrl = `${appBaseUrl()}/creator?tab=users&purchaseId=${purchase.id}${sellerProfileId ? `&profileId=${sellerProfileId}` : ''}`

        // 1. Send push to seller
        try {
          await supabase.functions.invoke('send-push-notification', {
            body: {
              userId: null,
              targetRole: 'creator',
              title: 'Новая покупка!',
              body: 'После проверки оплаты откройте доступ',
              data: {
                type: 'new_purchase',
                purchaseId: purchase.id,
                sellerProfileId,
                profileId: sellerProfileId,
              },
            },
          })
        } catch (pushErr) {
          console.error('Failed to send reminder push:', pushErr)
        }

        // 2. Send email to seller
        if (creator.email) {
          try {
            await sendTransactionalEmail({
              to: creator.email,
              subject: 'Новая покупка! После проверки оплаты откройте доступ',
              html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
                  <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 700;">Новая покупка ожидает подтверждения</h2>
                  <p style="font-size: 15px; line-height: 1.5; color: #374151; margin-bottom: 16px;">
                    После проверки оплаты откройте доступ. Чек ожидает проверки уже более 6 часов, а покупатель ждёт доступ к продукту.
                  </p>
                  <div style="background: #F3F4F6; border-radius: 8px; padding: 16px; margin: 16px 0;">
                    <p style="margin: 4px 0; font-size: 14px;"><strong>Продукт:</strong> ${prod.title || 'Курс/Материал'}</p>
                    <p style="margin: 4px 0; font-size: 14px;"><strong>Покупатель:</strong> ${buyerName}</p>
                    <p style="margin: 4px 0; font-size: 14px;"><strong>Сумма:</strong> ${purchase.amount} ₸</p>
                  </div>
                  <div style="margin: 24px 0;">
                    <a href="${checkUrl}" style="display: inline-block; background: #FF6B00; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
                      Проверить оплату
                    </a>
                  </div>
                  <p style="font-size: 13px; color: #6B7280; margin-top: 24px;">
                    Сверьте поступление в банковском приложении: чек легко подделать.
                  </p>
                </div>
              `,
            })
          } catch (mailErr) {
            console.error('Failed to send reminder email:', mailErr)
          }
        }

        // 3. Mark reminder sent
        await supabase
          .from('simple_purchases')
          .update({ seller_reminder_sent_at: new Date().toISOString() })
          .eq('id', purchase.id)

        sentCount++
      } catch (itemErr) {
        console.error('Error processing reminder for purchase', purchase.id, itemErr)
      }
    }

    return json({ processed: sentCount, total: pendingPurchases.length })
  } catch (err: any) {
    console.error('remind-pending-purchases error:', err)
    return json({ error: err?.message || 'Internal server error' }, 500)
  }
})
