Right. Classifying every consumer invocation across all 25 events as sync (must complete before HTTP response returns to user) or async (runs post-response via `waitUntil()`).

**Decision criteria:** a consumer is sync only if the user's immediate experience breaks without it. If the side effect can lag by milliseconds-to-seconds without the user noticing, it's async.

---

```
EVENT: claim_approved
Emitter: D&L
Trigger context: claim evaluation completes (auto or manual review callback)
─────────────────────────────────────────────────────────────────────────
Consumer                  Sync/Async  Rationale
─────────────────────────────────────────────────────────────────────────
Ops: claim volume tracking    ASYNC   Analytics. No user-facing effect.
PP: dashboard access grant    SYNC    User just claimed — next action is
                                      viewing their dashboard. If feature
                                      access isn't granted before response,
                                      they hit a permission wall.
PP: ISR revalidation          ASYNC   Profile page cache. Stale for seconds
                                      is acceptable.
CR: funnel entry logging      ASYNC   Analytics.
CR: win-back cancellation     ASYNC   Edge case (reclaim after churn).
                                      Milliseconds don't matter.
CR: conversion trigger reset  ASYNC   Internal state reset. No UX impact.


EVENT: claim_rejected
Emitter: D&L
Trigger context: claim evaluation completes
─────────────────────────────────────────────────────────────────────────
Consumer                  Sync/Async  Rationale
─────────────────────────────────────────────────────────────────────────
Ops: claim volume tracking    ASYNC   Analytics.


EVENT: listing_archived
Emitter: D&L
Trigger context: voluntary archival or account closure step
─────────────────────────────────────────────────────────────────────────
Consumer                  Sync/Async  Rationale
─────────────────────────────────────────────────────────────────────────
Ops: close active tickets     ASYNC   Internal ops. Provider doesn't see
                                      ticket state.
PP: remove from search        SYNC    If async, listing appears in search
                                      results after provider archived it.
                                      Confusing for both provider and buyers.
PP: ISR revalidation          ASYNC   Cache. Seconds-stale acceptable.
PP: shortlist update           ASYNC   Buyer-side. Lag acceptable.
CR: churn analysis (if paid)  ASYNC   Analytics.


EVENT: listing_suspended
Emitter: D&L
Trigger context: decay response or integrity violation
─────────────────────────────────────────────────────────────────────────
Consumer                  Sync/Async  Rationale
─────────────────────────────────────────────────────────────────────────
Ops: close/update tickets     ASYNC   Internal ops.
PP: warning indicator         ASYNC   Entity-initiated, not user-initiated.
                                      No user waiting for response.
PP: ISR revalidation          ASYNC   Cache.
PP: shortlist warning         ASYNC   Buyer-side. Lag acceptable.


EVENT: listing_reactivated
Emitter: D&L
Trigger context: provider reactivates archived listing
─────────────────────────────────────────────────────────────────────────
Consumer                  Sync/Async  Rationale
─────────────────────────────────────────────────────────────────────────
Ops: resume outreach          ASYNC   Internal ops.
PP: restore to search         SYNC    Provider just reactivated — they
                                      expect to be findable immediately.
PP: ISR revalidation          ASYNC   Cache.
PP: shortlist restore         ASYNC   Buyer-side.


EVENT: verification_tier_changed
Emitter: D&L
Trigger context: verification evaluation completes
─────────────────────────────────────────────────────────────────────────
Consumer                  Sync/Async  Rationale
─────────────────────────────────────────────────────────────────────────
PP: badge display update      ASYNC   Verification is background process,
                                      not user-initiated action. Provider
                                      isn't staring at screen waiting for
                                      badge to appear.
PP: search index update       ASYNC   Same reasoning.


EVENT: decay_signal_detected
Emitter: D&L
Trigger context: scheduled enrichment / liveness check
─────────────────────────────────────────────────────────────────────────
Consumer                  Sync/Async  Rationale
─────────────────────────────────────────────────────────────────────────
Ops: cross-ref active tickets ASYNC   Background process.
PP: "may be outdated" indicator ASYNC Background process. No user waiting.


EVENT: quality_score_changed
Emitter: D&L
Trigger context: quality score recomputation (profile edit, new credit, etc.)
─────────────────────────────────────────────────────────────────────────
Consumer                  Sync/Async  Rationale
─────────────────────────────────────────────────────────────────────────
PP: ranking recalculation     ASYNC   Score feeds ranking. Lag of seconds
                                      is imperceptible in search results.
PP: clear decay indicator     ASYNC   Derivative of score change.
CR: conversion triggers       ASYNC   Internal commercial logic.
CR: low-quality intervention  ASYNC   Internal commercial logic.


EVENT: erasure_completed
Emitter: D&L (within orchestrated flow directed by Ops)
Trigger context: GDPR erasure step 4 completes
─────────────────────────────────────────────────────────────────────────
Consumer                  Sync/Async  Rationale
─────────────────────────────────────────────────────────────────────────
Ops: close DSAR case          SYNC    This is the final step of the
                                      orchestrated erasure flow. The
                                      orchestrator (Ops) awaits completion
                                      of its own consumer before returning
                                      the flow as "complete."
PP: purge from search         ASYNC   User (requester) isn't searching.
PP: ISR revalidation          ASYNC   Cache.
PP: remove from shortlists   ASYNC   Buyer-side.
PP: notify shortlist owners   ASYNC   Notification. Can lag.
CR: cancel win-back           ASYNC   Internal state.
CR: anonymise churn log       ASYNC   Internal state.
CR: clear trigger state       ASYNC   Internal state.

⚠ NOTE: erasure_completed is emitted within an orchestrated flow,
not dispatched by the reactive event bus in the normal sense. The
Ops consumer (close DSAR case, create audit record) is called by
the orchestrator directly. The remaining consumers (PP, CR) are
reactive — they receive the event via the bus after the
orchestrator completes. So "SYNC" here means "within the
orchestrator's sequential execution", not "before HTTP response."
The HTTP response for an erasure request was sent days ago (72h
ack). This entire flow is background processing.


EVENT: subscription_tier_changed
Emitter: Operations (sole emitter)
Trigger context: Paddle webhook processed
─────────────────────────────────────────────────────────────────────────
Consumer                  Sync/Async  Rationale
─────────────────────────────────────────────────────────────────────────
D&L: recalculate enrichment   ASYNC   Internal cadence. No user-facing
      cadence                         effect.
PP: update feature access     SYNC    User just paid. If the webhook
                                      response completes but feature
                                      access hasn't updated, the user
                                      refreshes and still sees free-tier
                                      gates. ⚠ See note below.
PP: notify provider           ASYNC   Notification. Can lag.
CR: update revenue metrics    ASYNC   Analytics.

⚠ NOTE: The trigger context is a Paddle webhook, not a user HTTP
request. There is no "user waiting for response" — the webhook
handler returns 200 to Paddle. ALL consumers are technically async
relative to any user-facing request. The user's experience depends
on how quickly the feature access value is updated in the DB so
that their NEXT page load picks it up. This is a latency question,
not a sync/async question.

REVISED CLASSIFICATION: All consumers ASYNC. Feature access update
is high-priority async (execute first in the waitUntil chain).
The CR-X-13 optimistic UI update (from Paddle JS checkout.closed
on the client side) covers the immediate UX gap.


EVENT: subscription_ended
Emitter: Operations (primary), D&L (archival), Platform (closure)
Trigger context: varies by origin
─────────────────────────────────────────────────────────────────────────
Consumer                  Sync/Async  Rationale
─────────────────────────────────────────────────────────────────────────
PP: downgrade feature access  ASYNC   Same reasoning as subscription_tier
                                      _changed. Webhook-originated = no
                                      user request to block. Archival/
                                      closure-originated = within
                                      orchestrated flow (already async
                                      relative to original user action).
PP: show re-subscribe CTA    ASYNC   Next page load picks it up.
CR: churn event logging       ASYNC   Analytics.
CR: schedule win-back (60d)   ASYNC   Deferred action. By definition async.


EVENT: winback_delivery_result
Emitter: Operations
Trigger context: Resend delivery callback
─────────────────────────────────────────────────────────────────────────
Consumer                  Sync/Async  Rationale
─────────────────────────────────────────────────────────────────────────
CR: update churn analysis log ASYNC   Background delivery tracking.


EVENT: search_performed
Emitter: Platform
Trigger context: user executes search
─────────────────────────────────────────────────────────────────────────
Consumer                  Sync/Async  Rationale
─────────────────────────────────────────────────────────────────────────
D&L: zero-result tracking,   ASYNC   Analytics. Must not delay search
     taxonomy review                  results rendering.


EVENT: profile_viewed
Emitter: Platform
Trigger context: user views listing profile
─────────────────────────────────────────────────────────────────────────
Consumer                  Sync/Async  Rationale
─────────────────────────────────────────────────────────────────────────
D&L: engagement metric update ASYNC   Counter increment. Must not delay
                                      page render.


EVENT: enquiry_submitted
Emitter: Platform
Trigger context: buyer submits enquiry form
─────────────────────────────────────────────────────────────────────────
Consumer                  Sync/Async  Rationale
─────────────────────────────────────────────────────────────────────────
D&L: engagement metric update ASYNC   Counter.
D&L: unclaimed enquiry queue  SYNC    If the listing is unclaimed, the
                                      enquiry must be queued before the
                                      user sees the confirmation. If it
                                      fails silently, the buyer thinks
                                      their enquiry was sent but it was
                                      lost. ⚠ See note below.
CR: first_enquiry conversion  ASYNC   Internal commercial trigger.
     trigger

⚠ NOTE: The unclaimed enquiry queue write is critical for data
integrity, but the user doesn't see the queue — they see a
confirmation message ("Your enquiry has been saved and will be
delivered when this listing is claimed"). The confirmation can be
shown optimistically. If the queue write fails, the event bus
error logging catches it and admin dashboard surfaces it.

REVISED: ASYNC with high priority. The confirmation message is
shown regardless. Failure is caught by error logging (OQ-4 layer 1).
The integrity risk (lost enquiry) is low-frequency and recoverable.


EVENT: enquiry_responded
Emitter: Platform
Trigger context: provider responds to enquiry
─────────────────────────────────────────────────────────────────────────
Consumer                  Sync/Async  Rationale
─────────────────────────────────────────────────────────────────────────
D&L: response rate update     ASYNC   Analytics metric.


EVENT: contact_attempt
Emitter: Platform
Trigger context: buyer clicks contact info
─────────────────────────────────────────────────────────────────────────
Consumer                  Sync/Async  Rationale
─────────────────────────────────────────────────────────────────────────
D&L: data quality signal      ASYNC   Background signal.
Ops: outreach prioritisation  ASYNC   Internal ops.


EVENT: listing_created
Emitter: Platform
Trigger context: new listing created (onboarding or admin)
─────────────────────────────────────────────────────────────────────────
Consumer                  Sync/Async  Rationale
─────────────────────────────────────────────────────────────────────────
D&L: initial quality score    ASYNC   Score computation. User doesn't see
                                      their quality score during listing
                                      creation — it appears on dashboard
                                      later.
Ops: onboarding volume track  ASYNC   Analytics.


EVENT: profile_edited
Emitter: Platform
Trigger context: provider edits their listing
─────────────────────────────────────────────────────────────────────────
Consumer                  Sync/Async  Rationale
─────────────────────────────────────────────────────────────────────────
D&L: quality score recalc,    ASYNC   Provider doesn't see updated score
     freshness reset                  in the same request. Dashboard
                                      refresh picks it up.


EVENT: shortlist_added
Emitter: Platform
Trigger context: buyer adds listing to shortlist
─────────────────────────────────────────────────────────────────────────
Consumer                  Sync/Async  Rationale
─────────────────────────────────────────────────────────────────────────
(no cross-domain consumers)   N/A


EVENT: conversion_milestone
Emitter: Commercial
Trigger context: listing hits conversion trigger threshold
─────────────────────────────────────────────────────────────────────────
Consumer                  Sync/Async  Rationale
─────────────────────────────────────────────────────────────────────────
Ops: learning hypothesis L3   ASYNC   Background.
PP: dashboard notification    ASYNC   Notification. Can lag.


EVENT: churn_risk_detected
Emitter: Commercial
Trigger context: churn signal evaluation
─────────────────────────────────────────────────────────────────────────
Consumer                  Sync/Async  Rationale
─────────────────────────────────────────────────────────────────────────
Ops: ticket priority elevation ASYNC  Internal ops.
PP: dashboard quality suggest  ASYNC  Notification/suggestion.


EVENT: winback_eligible
Emitter: Commercial
Trigger context: 60-day post-cancellation timer fires
─────────────────────────────────────────────────────────────────────────
Consumer                  Sync/Async  Rationale
─────────────────────────────────────────────────────────────────────────
Ops: email delivery via Resend ASYNC  Deferred action. No user waiting.


EVENT: pending_cancellation_created
Emitter: Commercial
Trigger context: entity decides to cancel subscription (churn/low-quality)
─────────────────────────────────────────────────────────────────────────
Consumer                  Sync/Async  Rationale
─────────────────────────────────────────────────────────────────────────
Ops: Paddle API cancellation   ASYNC  Entity-initiated. No user request.
```

---

## Summary

```
SYNC consumers (must complete before response):        3
─────────────────────────────────────────────────────────────
claim_approved    → PP: dashboard access grant
listing_archived  → PP: remove from search index
listing_reactivated → PP: restore to search index

ASYNC consumers (post-response via waitUntil):        ~48
─────────────────────────────────────────────────────────────
Everything else.

ORCHESTRATED (not bus-dispatched, within sequential flow): 1
─────────────────────────────────────────────────────────────
erasure_completed → Ops: close DSAR case + audit record

N/A (no cross-domain consumers):                       1
─────────────────────────────────────────────────────────────
shortlist_added
```

Three findings worth noting:

**Finding 1:** only 3 of ~51 consumer invocations are sync. The event bus is overwhelmingly async. This validates the `waitUntil()` approach — the bus defaults to async dispatch, with sync as the explicit exception.

**Finding 2:** `subscription_tier_changed` initially looked sync (user just paid, expects features). On closer examination, it's webhook-originated — no user HTTP request to block. The client-side optimistic update (CR-X-13) covers the UX gap. All subscription events are async.

**Finding 3:** the three sync consumers share a pattern — they all involve **search index consistency**. The user just took an action (claimed, archived, reactivated) and expects the search results to reflect it. This suggests the search index update path is the one consumer that needs special treatment, not a general sync/async architecture problem.

This is ready to fold into the handover document or directly into the interface specs. Want me to append it to the handover file?