// Raw Paddle webhook types — Ops §5, S4 §2
// Paddle Billing API v2 webhook event structure.
// Only the fields CALLSHEET consumes are typed — remainder is passthrough.

type PaddleEventType =
  | "subscription.created"
  | "subscription.updated"
  | "subscription.canceled"
  | "subscription.past_due"
  | "transaction.completed"

export type PaddleWebhookEvent = {
  event_id: string
  event_type: PaddleEventType
  occurred_at: string // ISO 8601
  data: PaddleEventData
}

type PaddleEventData = {
  id: string // subscription or transaction ID
  status: string
  customer_id: string
  custom_data?: {
    listing_id?: string
    account_id?: string
  }
  items?: PaddleItem[]
  // subscription-specific
  current_billing_period?: {
    starts_at: string
    ends_at: string
  }
  scheduled_change?: {
    action: string
    effective_at: string
  } | null
  // cancellation
  canceled_at?: string | null
}

type PaddleItem = {
  price: {
    id: string
    product_id: string
    billing_cycle?: {
      interval: "month" | "year"
      frequency: number
    }
  }
  quantity: number
}
