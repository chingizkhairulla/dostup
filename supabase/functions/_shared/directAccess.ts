type Purchase = { status: string; is_trial?: boolean | null; trial_ends_at?: string | null; access_expires_at?: string | null };
type Subscription = { status: string; current_period_end: string };

export function directPurchaseActive(p: Purchase, subscription: Subscription | undefined, recurring: boolean, now = new Date()): boolean {
  if (p.status !== 'completed') return false;
  if (recurring) return !!subscription && ['active', 'cancelled'].includes(subscription.status) && new Date(subscription.current_period_end) > now;
  if (p.is_trial) return !!p.trial_ends_at && new Date(p.trial_ends_at) > now;
  return !p.access_expires_at || new Date(p.access_expires_at) > now;
}
