# S5 Stress Test — Part A (CR + Ops + SI)

**Agent:** A
**Boundaries:** Commercial & Revenue, Operations, Shared Infrastructure
**Scenarios:** S5-ST-1 through S5-ST-12

| # | Scenario | Severity | Slice § | Spec § | Finding |
|---|----------|----------|---------|--------|---------|
| S5-ST-1 | DeferredActionParamsMap missing S5 entries | High | §13 | SI §2.1 | `listing_update_reminder` and `enquiry_response_reminder` not in SI `DeferredActionParamsMap` |
| S5-ST-2 | SI §2.2 registered actions table missing S5 rows | High | §13 | SI §2.2 | Two deferred actions not in the registered actions table |
| S5-ST-3 | `enquiry_response` template missing from SI §5.2 and PP §4 inventory | High | §14, §5.4 | SI §5.2, PP §4 | Template not registered in the master inventory; template count will be 25 not 24 |
| S5-ST-4 | `PaymentService.getCustomerPortalUrl` not in SI §10.1 | Medium | §7.3 | SI §10.1 | S5 extends PaymentService but SI does not document the method |
| S5-ST-5 | Notification type `dismissed` / `dismissedAt` / `readAt` schema mismatch | Medium | §6.1 | SI §8.1 | SI defines `read: boolean`; S5 uses `dismissed`, `dismissedAt`, `readAt` — undocumented extension |
| S5-ST-6 | S5 notification types vs SI §8.1 — all 7 present | Pass | §15 | SI §8.1 | All 7 notification types referenced by S5 exist in SI §8.1 |
| S5-ST-7 | `computeFeatureAccess` P4 import — simplified signature | Pass | §1.3, §11 | CR §4.2 | S5 correctly imports `computeFeatureAccess(tier: SubscriptionTier)` per CR-ST-9 |
| S5-ST-8 | `mapFeatureAccessToUI` covers all `FeatureAccess` fields | Medium | §11 | CR §4.2 | `prioritySupport` field present in `FeatureAccess` but absent from `UIFeatureMap` |
| S5-ST-9 | S5 analytics tier table vs TIER_LIMITS — field alignment | Pass | §3.1 | CR §4.1 | Tier summary table matches `TIER_LIMITS` for all gated fields |
| S5-ST-10 | Account closure initiation matches SI §13.2 and PP §5 | Pass | §10.2 | SI §13.2, PP §5 | Closure flow correctly delegates to orchestrated flow engine |
| S5-ST-11 | `getSubscriptionStatus` data source — not an interface query | Low | §7.1, §3.2 | Ops §3 | S5 calls `getSubscriptionStatus` which is S4's internal tRPC route, not a cross-domain query — correctly scoped |
| S5-ST-12 | S5 claims "no new EVENT_CONSUMER_MATRIX entries" — verification | Medium | §12 | SI §1.5 | S5's `profile_edited` consumer adds S5 logic (90-day reminder scheduling) to an existing PP consumer registered in S1 — correct that no new matrix entry needed, but the expanded handler scope is undocumented |

---

### S5-ST-1: DeferredActionParamsMap missing S5 deferred actions

**Severity:** High
**Slice section:** §13 (Deferred Actions Registered in S5)
**Upstream reference:** SI §2.1 (`DeferredActionParamsMap` type)

**Problem:** S5 §13 registers two deferred actions — `listing_update_reminder` and `enquiry_response_reminder` — and documents the `DeferredActionParamsMap` extension. However, SI §2.1 does not include these two entries in the `DeferredActionParamsMap` type. The current SI §2.1 `DeferredActionParamsMap` contains 9 entries (last additions were `grace_period_expiry` and `checkout_precondition_retry` from S4-ST-1). Without adding S5's entries, the TypeScript compiler will reject `scheduleDeferredAction("listing_update_reminder", ...)` calls at build time.

This is the recurring three-part sync pattern identified in S0, S2, S3, and S4 stress tests: every slice that adds deferred actions must update (1) `DeferredActionParamsMap`, (2) SI §2.2 registered actions table, and (3) the handler registration. S5 correctly documents the intent in §13 but the SI spec itself needs the corresponding amendment.

**Fix — slice:**
- No slice change needed. S5 §13 correctly documents the extension.

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §2.1 `DeferredActionParamsMap`
- Change: Add two entries:
  ```
  listing_update_reminder: { listingId: UUID }
  enquiry_response_reminder: { enquiryId: UUID; listingId: UUID }
  ```

**Acceptance criteria impact:** None — S5 ACs already test the deferred actions (AC-35, AC-36, AC-37, AC-20, AC-21). The fix is to the upstream spec, not the slice.

---

### S5-ST-2: SI §2.2 registered actions table missing S5 rows

**Severity:** High
**Slice section:** §13 (Deferred Actions Registered in S5)
**Upstream reference:** SI §2.2 (Registered Actions by Domain)

**Problem:** SI §2.2 registered actions table contains 9 actions. S5 §13 specifies two additions (`listing_update_reminder` and `enquiry_response_reminder`) with owner, schedule, retry, and onFailure values. These rows are not yet in SI §2.2. Without them, the SI spec is incomplete as a registry of all deferred actions in the system. This is the second part of the three-part sync pattern.

**Fix — slice:**
- No slice change needed. S5 §13 already documents the intended rows.

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §2.2 (Registered Actions by Domain table)
- Change: Add two rows:
  ```
  | Platform | `listing_update_reminder` | 90 days after profile edit (recurring via self-scheduling) | `once` | `log` |
  | Platform | `enquiry_response_reminder` | 7 days after enquiry delivery | `once` | `log` |
  ```

**Acceptance criteria impact:** None.

---

### S5-ST-3: `enquiry_response` template missing from SI §5.2 and PP §4 master inventory

**Severity:** High
**Slice section:** §14 (Email Templates Registered in S5), §5.4 (Enquiry Response Email Template)
**Upstream reference:** SI §5.2 (Template Inventory — 24 templates), PP §4 (Email Template Inventory — 24 templates)

**Problem:** S5 §14 registers 1 new email template: `enquiry_response` (category: Transactional, unsubscribable: No, owner: PP). S5 §14 claims "Template count after S5: S0 (2) + S2 (7) + S3 (4) + S4 (1) + S5 (1) = 15 of 24." However, the master inventory total is wrong. SI §5.2 and PP §4 currently list 24 templates total, and `enquiry_response` is not among them. After adding `enquiry_response`, the master inventory should be 25, not 24. S5 §14 should read "15 of 25".

The 24 templates in SI §5.2/PP §4 are: Platform Transactional (14), Operations Compliance (4), Subscription (1), Commercial Conversion (5) = 24. `enquiry_response` is template #25.

Additionally, S5 §14 notes that `listing_update_reminder` and `enquiry_reminder` are "already registered in SI §5.2 / PP §4 — no new registration needed for those." This is correct — both are present in the Platform Transactional section of SI §5.2. S5 only adds `enquiry_response`, which is genuinely new and must be added to both SI §5.2 and PP §4.

**Fix — slice:**
- Section: §14
- Old: `Template count after S5: S0 (2) + S2 (7) + S3 (4) + S4 (1) + S5 (1) = 15 of 24.`
- New: `Template count after S5: S0 (2) + S2 (7) + S3 (4) + S4 (1) + S5 (1) = 15 of 25.`

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §5.2 — add `enquiry_response` to Platform Transactional table. Update header comment from "24 templates" to "25 templates". Update `EmailTemplateId` comment.
- Change: Add row: `| enquiry_response | Provider responds to enquiry | No |`

- Document: `interfaces/platform-and-product.md`
- Section: §4.1 — add `enquiry_response` to Platform Transactional table. Update summary from "24 templates" to "25 templates".
- Change: Add row: `| enquiry_response | Provider responds to enquiry via dashboard | Transactional | No |`

**Acceptance criteria impact:** AC-18 tests the enquiry response flow including email send. The fix ensures the template exists in upstream specs.

---

### S5-ST-4: `PaymentService.getCustomerPortalUrl` not documented in SI §10.1

**Severity:** Medium
**Slice section:** §7.3 (PaymentService Extension)
**Upstream reference:** SI §10.1 (Service Interfaces — `PaymentService`)

**Problem:** S5 §7.3 extends `PaymentService` with a `getCustomerPortalUrl` method. S5 §19 downstream flag S5-9 correctly identifies this as a needed SI amendment. However, the actual method signature is only in S5 — SI §10.1 currently defines `PaymentService` with three methods (`createCheckoutSession`, `cancelSubscription`, `listSubscriptions`), none of which is `getCustomerPortalUrl`. Until SI §10.1 is updated, the `PaymentService` contract is incomplete and the test mock (SI §10.2) will not include this method.

S5 flags this as downstream flag S5-9, so the intent is documented. The issue is that downstream flags are resolved when sibling specs are edited — this fix should be applied during the stress test fix phase, not deferred.

**Fix — slice:**
- No slice change needed. S5 §7.3 correctly specifies the extension.

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §10.1 `PaymentService`
- Change: Add method to `PaymentService` interface:
  ```typescript
  getCustomerPortalUrl(params: {
    paddleCustomerId: string
  }): Promise<string>
  ```

**Acceptance criteria impact:** AC-30 tests the Paddle portal link. The fix ensures the service abstraction layer includes the method.

---

### S5-ST-5: Notification schema mismatch — `dismissed`/`dismissedAt`/`readAt` vs SI §8.1 `read`

**Severity:** Medium
**Slice section:** §6.1 (Notification Display — tRPC routes)
**Upstream reference:** SI §8.1 (Notification Infrastructure — `Notification` type)

**Problem:** SI §8.1 defines `Notification` with a single boolean field `read: boolean`. S5 §6.1 implements notification routes that use three additional fields not in SI's type: `dismissed: boolean`, `dismissedAt: ISO8601`, and `readAt: ISO8601`. S5's `list` query filters on `dismissed === false`, `dismiss` mutation sets `dismissed: true` and `dismissedAt`, and `markRead` mutation sets `readAt`. The SI type has no concept of dismiss — only `read`.

This is a structural gap. Either SI §8.1's `Notification` type should be extended to include `dismissed`, `dismissedAt`, and `readAt` (replacing the simple `read: boolean`), or S5 should align with SI's simpler model where `read` covers both read and dismiss states. Given S5's requirement for separate read and dismiss actions (a notification can be read but still visible; dismiss removes it from the list), the SI type needs extension.

**Fix — slice:**
- No change needed. S5's schema is the more complete model.

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §8.1 `Notification` type
- Change: Replace `read: boolean` with:
  ```typescript
  readAt?: ISO8601           // null = unread
  dismissed: boolean         // true = soft-deleted from list
  dismissedAt?: ISO8601
  ```

**Acceptance criteria impact:** AC-23, AC-24, AC-25 test notification list, dismiss, and unread count. The fix aligns SI's authoritative type with S5's implementation requirements.

---

### S5-ST-6: S5 notification types vs SI §8.1 — all 7 present

**Severity:** Pass
**Slice section:** §15 (Notification Types Used in S5)
**Upstream reference:** SI §8.1 (`NotificationType` union)

**Problem:** S5 §15 lists 7 notification types used by S5:

1. `enquiry_received` — present in SI §8.1
2. `quality_score_changed` — present in SI §8.1
3. `decay_warning` — present in SI §8.1
4. `subscription_confirmed` — present in SI §8.1
5. `subscription_ending` — present in SI §8.1
6. `conversion_milestone` — present in SI §8.1
7. `churn_risk_suggestion` — present in SI §8.1

All 7 types exist in SI §8.1's `NotificationType` union. S5 correctly claims "All types already defined in SI §8.1. No extension needed." Verified.

---

### S5-ST-7: `computeFeatureAccess` P4 import — simplified signature compliance

**Severity:** Pass
**Slice section:** §1.3 (Listing Context Provider), §11 (`mapFeatureAccessToUI`)
**Upstream reference:** CR §4.2 (`computeFeatureAccess`)

**Problem:** S5 §1.3 calls `computeFeatureAccess(listing.subscriptionTier)` — passing `SubscriptionTier` directly. CR §4.2 specifies `computeFeatureAccess(tier: SubscriptionTier): FeatureAccess` per CR-ST-9 simplification. The signatures match.

S5 §11 consumes the returned `FeatureAccess` type and maps it to `UIFeatureMap`. The import path is correct (P4 compliance — import from CR, do not redefine).

No issue.

---

### S5-ST-8: `mapFeatureAccessToUI` missing `prioritySupport` field from `FeatureAccess`

**Severity:** Medium
**Slice section:** §11 (`mapFeatureAccessToUI`)
**Upstream reference:** CR §4.2 (`FeatureAccess` = `TierLimits & { ... }`)

**Problem:** CR §4.2 defines `FeatureAccess = TierLimits & { directContactVisible, organicSearchVisible, enquiriesEnabled, basicAnalytics }`. `TierLimits` (CR §4.1) includes the field `prioritySupport: boolean` (Partner-only). S5 §11's `UIFeatureMap` type maps:

- `analyticsPanel` — covers `trendAnalytics`, `topSearchTerms`, `viewerDemographics`, `competitorBenchmarking`, `enquiryResponseInsights`
- `profileEditor` — covers `maxMedia`, `maxCredits`, `customTags`
- `searchVisibility` — covers `rankingBoost`, `sponsoredPlacement`

The `prioritySupport` field from `FeatureAccess` is not mapped anywhere in `UIFeatureMap`. The four always-true fields (`directContactVisible`, `organicSearchVisible`, `enquiriesEnabled`, `basicAnalytics`) are reasonably omitted since they are always true and need no gating UI. But `prioritySupport` is a tier-differentiating boolean (false for free/standard/premium, true for partner only) that should display on the subscription panel as a feature included in the Partner tier.

This is not blocking — `prioritySupport` enforcement is in Operations (Ops reads tier for SLA routing, per CR-ST-12). But the dashboard subscription panel (S5 §7.1) shows "feature summary from computeFeatureAccess" and should indicate whether priority support is included. Without mapping it, Partner subscribers see no UI acknowledgment of this feature.

**Fix — slice:**
- Section: §11 `UIFeatureMap` type
- Old: (no `prioritySupport` field)
- New: Add to `UIFeatureMap`:
  ```typescript
  support: {
    prioritySupport: FeatureGateUIState
  }
  ```
  And in `mapFeatureAccessToUI`:
  ```typescript
  support: {
    prioritySupport: access.prioritySupport ? "available" : "locked",
  }
  ```

**Fix — sibling specs:** None needed. CR §4.1 already defines the field.

**Acceptance criteria impact:** AC-42 tests `mapFeatureAccessToUI` returns correct gate states per tier. The fix ensures `prioritySupport` is covered by this test.

---

### S5-ST-9: S5 analytics tier table vs TIER_LIMITS field alignment

**Severity:** Pass
**Slice section:** §3.1 (Tier-Gated Analytics — tier summary table)
**Upstream reference:** CR §4.1 (`TIER_LIMITS`)

**Problem:** S5 §3.1 tier summary table maps features to tiers:

| Feature | S5 mapping | TIER_LIMITS field | Match? |
|---|---|---|---|
| All-time totals | Free: Yes | `basicAnalytics: true` (FeatureAccess) | Yes |
| 30-day trends | Standard: Yes | `trendAnalytics: "30d"` | Yes |
| 90-day trends | Premium/Partner: Yes | `trendAnalytics: "90d"` | Yes |
| Top search terms | Standard: Yes | `topSearchTerms: true` (standard+) | Yes |
| Viewer demographics | Premium/Partner: Yes | `viewerDemographics: true` (premium+) | Yes |
| Competitor benchmarking | Premium/Partner: Yes | `competitorBenchmarking: true` (premium+) | Yes |
| Enquiry response insights | Premium/Partner: Yes | `enquiryResponseInsights: true` (premium+) | Yes |

All fields align correctly. S5 §3 `mapAnalyticsToUI` branches on these exact `FeatureAccess` fields. No issue.

---

### S5-ST-10: Account closure initiation matches SI §13.2 and PP §5

**Severity:** Pass
**Slice section:** §10.2 (Account Closure Initiation)
**Upstream reference:** SI §13.2 (Account Closure), PP §5 (Account Closure Orchestration)

**Problem:** S5 §10.2 calls `startOrchestratedFlow({ flowType: "closure", triggeredBy: ctx.session.userId, context: { accountId: ctx.session.userId } })`. This matches SI §3.3 `executeOrchestratedFlow` parameters (`flowType: "erasure" | "closure"`, `triggeredBy: UUID`). PP §5 defines the 6-step closure flow. S5 correctly delegates to the orchestrator rather than implementing closure steps inline.

S5 §10.2 notes "The orchestrated flow itself is specified in PP interface spec §5 (6 steps)" and defers admin monitoring to S7 and erasure to S10. This is correct.

The `triggeredBy` parameter uses `ctx.session.userId` which is a UUID (account ID). SI §3.2 types `triggeredBy: UUID` with the note "accountId or DSAR requestId". For closure, accountId is the correct value. S0 stress test confirmed `triggeredBy` is text not UUID for DSAR (external references), but for closure it is the user's own accountId. No conflict.

No issue.

---

### S5-ST-11: `getSubscriptionStatus` is S4 internal, not a cross-domain query

**Severity:** Low
**Slice section:** §7.1 (Subscription Panel), §3.2 (`getListingDashboard` route)
**Upstream reference:** Ops §3 (Query Interfaces Exposed)

**Problem:** S5 §3.2 calls `getSubscriptionStatus(ctx, input.listingId)` and §7.1 references "S4 `getSubscriptionStatus`". This function is defined in S4 as a tRPC route (`slice-04-subscriptions.md` §3.1), not as a cross-domain query interface. S5 correctly cites it as S4-internal rather than an Ops query.

Potential confusion: a reader might wonder if subscription status should be a documented query interface (like Ops §3.1 `hasActiveTicket`). It should not — both S4 and S5 are PP-owned. `getSubscriptionStatus` is an intra-domain call within Platform & Product. No interface spec amendment needed.

The cross-references in §19 correctly cite `slice-04-subscriptions.md (v2)` with `getSubscriptionStatus §3.1`. S5 §16 dependency list includes S4. No issue beyond being a minor documentation clarity point — the call is internal to PP.

**Fix — slice:** None needed. Correctly scoped.

**Fix — sibling specs:** None needed.

**Acceptance criteria impact:** None.

---

### S5-ST-12: EVENT_CONSUMER_MATRIX — S5's `profile_edited` handler expansion undocumented

**Severity:** Medium
**Slice section:** §12 (Event Consumers Registered in S5), §9.2 (Scheduling Trigger)
**Upstream reference:** SI §1.5 (`EVENT_CONSUMER_MATRIX`)

**Problem:** S5 §12 claims "No new `EVENT_CONSUMER_MATRIX` entries required." S5 §9.2 adds 90-day reminder scheduling logic to PP's existing `profile_edited` consumer (already registered in S1 §10). The claim is technically correct — no new matrix entry is needed because PP already has an async consumer for `profile_edited`.

However, S5 §9.2 expands the PP `profile_edited` consumer handler with new behaviour (cancel/reschedule deferred action) beyond S1's original scope (quality score recalc trigger). The expanded handler scope should be documented back in S1's consumer table or in the cross-references to prevent a future reader from assuming the `profile_edited` PP consumer only handles quality score recalculation. If S1's consumer table row says "quality score recalc trigger" and a developer implements only that, the 90-day reminder scheduling is silently lost.

This is not a structural gap (the matrix entry exists, the handler is registered), but it is an ambiguity risk. The consumer's responsibility has grown across slices without the registration documentation reflecting the growth.

**Fix — slice:**
- Section: §12, table row for `profile_edited`
- Old: (no row for `profile_edited` in S5's table — it only lists events where S5 renders data from existing consumers)
- New: Add a note below the table: "S5 extends PP's `profile_edited` consumer (registered in S1 §10) with 90-day reminder scheduling (§9.2). The consumer handler now performs two actions: (1) quality score recalc trigger (S1), (2) 90-day listing update reminder cancel/reschedule (S5). Both are async."

**Fix — sibling specs:** None strictly required, but recommended:
- Document: `slices/slice-01-data-model.md`
- Section: S1's consumer table for `profile_edited` PP consumer
- Change: Add note: "Extended by S5 §9.2 with 90-day reminder scheduling."

**Acceptance criteria impact:** AC-35 and AC-36 test the reminder scheduling. The fix prevents implementation drift where S1's consumer is coded without S5's extension.
