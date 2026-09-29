export type SubmissionStatus = {
  id?: string
  verification_status: string
} | null | undefined

const CREATOR_REVIEW_STATUSES = new Set(['pending', 'manual_review'])

export function needsCreatorReview(purchase: {
  status: string
  latest_submission?: SubmissionStatus
}) {
  if (purchase.status !== 'pending') return false
  const status = purchase.latest_submission?.verification_status
  if (!status) return true
  return CREATOR_REVIEW_STATUSES.has(status)
}

export function allowsReceiptRetry(status: string | null | undefined) {
  return (
    !status ||
    status === 'rejected' ||
    status === 'payment_qr_or_invoice' ||
    status === 'unreadable' ||
    status === 'pending'
  )
}
