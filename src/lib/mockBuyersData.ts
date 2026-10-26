/**
 * Mock buyers and pending payments for testing the creator dashboard
 * when there are no real buyers yet.
 */

export interface MockProduct {
  id: string;
  title: string;
}

const DEMO_DECISIONS_KEY = "dostup_demo_decisions";

export function getDemoDecisions(): Record<string, "approved" | "rejected"> {
  try {
    const raw = sessionStorage.getItem(DEMO_DECISIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setDemoDecision(purchaseId: string, decision: "approved" | "rejected") {
  try {
    const current = getDemoDecisions();
    current[purchaseId] = decision;
    sessionStorage.setItem(DEMO_DECISIONS_KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
}

export function getMockPendingPurchases(products: MockProduct[]) {
  const decisions = getDemoDecisions();
  const prods = products.length > 0 ? products : [{ id: "demo-p-1", title: "Курс по веб-разработке" }];

  const all: any[] = [];
  prods.forEach((prod, pIdx) => {
    all.push(
      {
        id: `demo-pending-${pIdx}-1`,
        amount: 15000,
        status: "pending",
        created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        product_id: prod.id,
        product: prod,
        user: { id: `demo-user-p-${pIdx}-1`, name: "Ерлан Бериков", phone: "+7 701 555 12 34" },
        latest_submission: {
          id: `demo-submission-${pIdx}-1`,
          verification_status: "manual_review",
        },
      },
      {
        id: `demo-pending-${pIdx}-2`,
        amount: 25000,
        status: "pending",
        created_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
        product_id: prod.id,
        product: prod,
        user: { id: `demo-user-p-${pIdx}-2`, name: "Диас Сатпаев", phone: "+7 777 444 22 11" },
        latest_submission: {
          id: `demo-submission-${pIdx}-2`,
          verification_status: "pending",
        },
      }
    );
  });

  return all.filter((item) => !decisions[item.id]);
}

export function getMockPaidPurchases(products: MockProduct[]) {
  const prods = products.length > 0 ? products : [{ id: "demo-p-1", title: "Курс по веб-разработке" }];

  const now = Date.now();
  const dayMs = 24 * 3600 * 1000;

  const list: any[] = [];
  prods.forEach((prod, pIdx) => {
    list.push(
      // 1. Временный доступ на 35 дней, заканчивается через 2 дня (срочный - Скоро)
      {
        id: `demo-paid-${pIdx}-1`,
        status: "completed",
        amount: 15000,
        created_at: new Date(now - 33 * dayMs).toISOString(),
        product_id: prod.id,
        product: prod,
        simple_user_id: `demo-user-${pIdx}-1`,
        simple_user: { id: `demo-user-${pIdx}-1`, name: "Алихан Смагулов", phone: "+7 705 111 22 33" },
        user: { id: `demo-user-${pIdx}-1`, name: "Алихан Смагулов", phone: "+7 705 111 22 33" },
        assigned_teacher_id: null,
        can_choose_teacher: null,
        is_trial: false,
        trial_ends_at: null,
        access_expires_at: new Date(now + 2 * dayMs).toISOString(),
        receipts: [
          {
            id: `demo-receipt-${pIdx}-1`,
            verification_status: "confirmed",
            detected_amount: 15000,
            receipt_mime_type: "image/jpeg",
            created_at: new Date(now - 33 * dayMs).toISOString(),
          },
        ],
        subscription: null,
      },
      // 2. Временный доступ на 3 месяца, заканчивается через 75 дней (Далеко)
      {
        id: `demo-paid-${pIdx}-2`,
        status: "completed",
        amount: 12000,
        created_at: new Date(now - 15 * dayMs).toISOString(),
        product_id: prod.id,
        product: prod,
        simple_user_id: `demo-user-${pIdx}-2`,
        simple_user: { id: `demo-user-${pIdx}-2`, name: "Динара Касымова", phone: "+7 775 222 33 44" },
        user: { id: `demo-user-${pIdx}-2`, name: "Динара Касымова", phone: "+7 775 222 33 44" },
        assigned_teacher_id: null,
        can_choose_teacher: null,
        is_trial: false,
        trial_ends_at: null,
        access_expires_at: new Date(now + 75 * dayMs).toISOString(),
        receipts: [
          {
            id: `demo-receipt-${pIdx}-2`,
            verification_status: "confirmed",
            detected_amount: 12000,
            receipt_mime_type: "image/jpeg",
            created_at: new Date(now - 15 * dayMs).toISOString(),
          },
        ],
        subscription: null,
      },
      // 3. Подписка на 1 месяц со следующим списанием через 7 дней
      {
        id: `demo-paid-${pIdx}-3`,
        status: "completed",
        amount: 8000,
        created_at: new Date(now - 6 * dayMs).toISOString(),
        product_id: prod.id,
        product: { ...prod, billing_period: "month" },
        simple_user_id: `demo-user-${pIdx}-3`,
        simple_user: { id: `demo-user-${pIdx}-3`, name: "Тимур Ахметов", phone: "+7 708 333 44 55" },
        user: { id: `demo-user-${pIdx}-3`, name: "Тимур Ахметов", phone: "+7 708 333 44 55" },
        assigned_teacher_id: null,
        can_choose_teacher: null,
        is_trial: false,
        trial_ends_at: null,
        access_expires_at: null,
        receipts: [
          {
            id: `demo-receipt-${pIdx}-3`,
            verification_status: "confirmed",
            detected_amount: 8000,
            receipt_mime_type: "image/jpeg",
            created_at: new Date(now - 6 * dayMs).toISOString(),
          },
        ],
        subscription: {
          id: `demo-sub-${pIdx}-3`,
          status: "active",
          current_period_end: new Date(now + 7 * dayMs).toISOString(),
          cancel_at_period_end: false,
        },
      },
      // 4. Срок доступа истёк (Закрыт)
      {
        id: `demo-paid-${pIdx}-4`,
        status: "completed",
        amount: 10000,
        created_at: new Date(now - 8 * dayMs).toISOString(),
        product_id: prod.id,
        product: prod,
        simple_user_id: `demo-user-${pIdx}-4`,
        simple_user: { id: `demo-user-${pIdx}-4`, name: "Мадина Серикова", phone: "+7 702 777 88 99" },
        user: { id: `demo-user-${pIdx}-4`, name: "Мадина Серикова", phone: "+7 702 777 88 99" },
        assigned_teacher_id: null,
        can_choose_teacher: null,
        is_trial: false,
        trial_ends_at: null,
        access_expires_at: new Date(now - 1 * dayMs).toISOString(),
        receipts: [
          {
            id: `demo-receipt-${pIdx}-4`,
            verification_status: "confirmed",
            detected_amount: 10000,
            receipt_mime_type: "image/jpeg",
            created_at: new Date(now - 8 * dayMs).toISOString(),
          },
        ],
        subscription: null,
      },
      // 5. Бессрочный доступ (Навсегда)
      {
        id: `demo-paid-${pIdx}-5`,
        status: "completed",
        amount: 30000,
        created_at: new Date(now - 10 * dayMs).toISOString(),
        product_id: prod.id,
        product: prod,
        simple_user_id: `demo-user-${pIdx}-5`,
        simple_user: { id: `demo-user-${pIdx}-5`, name: "Айгерим Муратова", phone: "+7 707 999 00 11" },
        user: { id: `demo-user-${pIdx}-5`, name: "Айгерим Муратова", phone: "+7 707 999 00 11" },
        assigned_teacher_id: null,
        can_choose_teacher: null,
        is_trial: false,
        trial_ends_at: null,
        access_expires_at: null,
        receipts: [
          {
            id: `demo-receipt-${pIdx}-5`,
            verification_status: "confirmed",
            detected_amount: 30000,
            receipt_mime_type: "image/jpeg",
            created_at: new Date(now - 10 * dayMs).toISOString(),
          },
        ],
        subscription: null,
      }
    );
  });

  return list;
}
