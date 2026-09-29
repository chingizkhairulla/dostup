import { json, optionsResponse } from '../_shared/http.ts'
import { resolveCreator, serviceClient } from '../_shared/session.ts'
import { completePurchase, recordVerificationEvent } from '../_shared/purchase.ts'
import { appBaseUrl, sendTransactionalEmail } from '../_shared/transactional-email.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  try {
    const { purchaseId, creatorToken, creatorName } = await req.json()

    if (!purchaseId || !creatorToken || !creatorName) {
      return json({ error: 'Missing required fields' }, 400)
    }

    const supabase = serviceClient()
    const creator = await resolveCreator(supabase, creatorToken, creatorName)
    if (!creator) {
      return json({ error: 'Invalid or expired session' }, 401)
    }

    const { data: purchase, error: purchaseError } = await supabase
      .from('simple_purchases')
      .select('id, product_id, status')
      .eq('id', purchaseId)
      .single()

    if (purchaseError || !purchase) {
      return json({ error: 'Purchase not found' }, 404)
    }

    const { data: product } = await supabase
      .from('products')
      .select('creator_account_id')
      .eq('id', purchase.product_id)
      .single()

    if (!product || product.creator_account_id !== creator.accountId) {
      return json({ error: 'Not authorized to approve this purchase' }, 403)
    }

    const completed = await completePurchase(supabase, purchaseId)
    if (!completed.ok) return json({ error: completed.error }, 409)

    const { data: submission } = await supabase
      .from('payment_submissions')
      .select('id, verification_status')
      .eq('purchase_id', purchaseId)
      .in('verification_status', ['manual_review', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (submission) {
      await supabase
        .from('payment_submissions')
        .update({
          verification_status: 'confirmed',
          decided_at: new Date().toISOString(),
          decided_by: `creator:${creator.login}`,
          rejection_reason: null,
        })
        .eq('id', submission.id)

      await recordVerificationEvent(supabase, {
        submissionId: submission.id,
        purchaseId,
        actor: `creator:${creator.login}`,
        decision: 'confirmed',
        checks: { source: 'creator_manual_review' },
        notes: 'creator_approved',
      })
    }

    // Tell the buyer: send push & email (Prompt 3 requirement)
    if (!completed.already) {
      try {
        const { data: prod } = await supabase
          .from('products')
          .select('id, title, slug')
          .eq('id', purchase.product_id)
          .maybeSingle()

        const buyerId = completed.purchase?.buyer_profile_id || completed.purchase?.simple_user_id

        // 1. Send push to buyer
        try {
          await supabase.functions.invoke('send-push-notification', {
            body: {
              userId: buyerId,
              targetRole: 'student',
              title: 'Доступ открыт!',
              body: 'Қол жеткізу ашылды!',
              data: {
                type: 'material_unlocked',
                purchaseId: purchase.id,
                productId: purchase.product_id,
              },
            },
          })
        } catch (pushErr) {
          console.error('Failed to send push to buyer on confirmation:', pushErr)
        }

        // 2. Send email to buyer
        let buyerEmail: string | null = null
        if (completed.purchase?.buyer_profile_id) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('auth_user_id')
            .eq('id', completed.purchase.buyer_profile_id)
            .maybeSingle()
          if (prof?.auth_user_id) {
            const { data: authUser } = await supabase.auth.admin.getUserById(prof.auth_user_id)
            if (authUser?.user?.email) buyerEmail = authUser.user.email
          }
        }

        if (buyerEmail) {
          try {
            const productUrl = `${appBaseUrl()}/p/${prod?.slug || purchase.product_id}`
            await sendTransactionalEmail({
              to: buyerEmail,
              subject: 'Доступ открыт! / Қол жеткізу ашылды!',
              html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
                  <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 700;">Доступ открыт! / Қол жеткізу ашылды!</h2>
                  <p style="font-size: 15px; line-height: 1.5; color: #374151; margin-bottom: 16px;">
                    Продавец подтвердил вашу оплату. Вам открыт полный доступ к материалам курса.
                  </p>
                  <div style="background: #F3F4F6; border-radius: 8px; padding: 16px; margin: 16px 0;">
                    <p style="margin: 4px 0; font-size: 15px;"><strong>${prod?.title || 'Продукт'}</strong></p>
                  </div>
                  <div style="margin: 24px 0;">
                    <a href="${productUrl}" style="display: inline-block; background: #FF6B00; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
                      Перейти к материалам
                    </a>
                  </div>
                </div>
              `,
            })
          } catch (mailErr) {
            console.error('Failed to send confirmation email to buyer:', mailErr)
          }
        }
      } catch (buyerNotifErr) {
        console.error('Error notifying buyer on confirmation:', buyerNotifErr)
      }
    }

    return json({ success: true, already: completed.already })
  } catch (error) {
    console.error('Error in approve-purchase:', error)
    return json({ error: 'Internal server error' }, 500)
  }
})
