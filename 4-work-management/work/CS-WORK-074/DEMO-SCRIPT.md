# CALLSHEET Demo Walkthrough Script

## Pre-Demo Setup

Run these steps in order. Integration tests truncate all tables, so always re-seed after running tests.

1. **Start Supabase:** `npx supabase start` (if not running)
2. **Push schema:** `npx drizzle-kit push`
3. **Seed taxonomy + custom SQL:** `npm run db:seed && npm run db:custom-sql`
4. **Seed demo data:** `npx tsx src/db/seed/demo.ts`
5. **Start dev server:** `npm run dev`
6. **Verify login:** Open `http://localhost:3000/login`, sign in as `demo@callsheet.test` / `password123` — should reach `/dashboard`
7. **Verify search:** Navigate to `/search`, type "camera" — should return 2 results
8. **Verify admin:** Sign out, sign in as `admin@callsheet.test` / `password123` — should reach `/admin`

If step 6 or 7 fails, re-run steps 2–4. If step 8 fails, check that `demo.ts` creates the admin user with `role: "admin"`.

**Full reset (nuclear):** `npm run db:reset` (runs `supabase db reset → drizzle-kit push → db:seed`), then re-run steps 3–4.

---

**Credentials:**
- Demo user: `demo@callsheet.test` / `password123` (provider + buyer)
- Admin user: `admin@callsheet.test` / `password123` (role: admin)

---

## Journey 1: Buyer (search, profile, shortlist, enquiry)

### 1.1 Search

1. Navigate to `/search`
2. Enter "camera" in the search box — expect 2 results: Apex Camera Rentals (quality 82, verified), Sarah Chen (quality 71, claimed)
3. Enter "post production" — expect Northlight Post (quality 45, unclaimed, free tier)
4. Enter "sound" — expect Mark Thompson (quality 67, verified, standard tier)
5. Note: results are ranked by `ts_rank_cd * (1 + quality_boost + paid_boost)` — premium listings appear higher

### 1.2 Listing Profile

1. Click on "Apex Camera Rentals" — navigates to `/providers/apex-camera-rentals`
2. Observe: verified badge, premium tier indicator, 2 credits (The Crown S6, Wicked), headline, bio, contact info
3. Note the targeted claim CTA is absent (listing is claimed)
4. Click on "Northlight Post" — note the claim CTA appears (listing is unclaimed)

### 1.3 Shortlist (requires login as demo user)

1. Log in as `demo@callsheet.test`
2. Navigate to `/dashboard/shortlists`
3. Observe: "Camera & Studio options" shortlist with 3 items (Sarah Chen, Green Spark Studios, Brightside Casting)

### 1.4 Enquiry (requires login as demo user)

1. Navigate to `/dashboard/enquiries-sent`
2. Observe: 2 sent enquiries — one to Green Spark Studios (responded, green), one to Brightside Casting (unread, grey)

---

## Journey 2: Provider (login, dashboard, listings, analytics, enquiries)

### 2.1 Dashboard Overview

1. Log in as `demo@callsheet.test` (already a provider — owns Apex Camera Rentals)
2. Navigate to `/dashboard`
3. Observe: listing card for Apex Camera Rentals with quality score 82, verified badge, premium tier
4. Profile strength meter should show high completion (headline, bio, website, contact email, credits all present)
5. Unread notification count visible in header

### 2.2 Listing Detail

1. Click on Apex Camera Rentals listing
2. Navigate to `/dashboard/listings/{listingId}`
3. Observe: listing fields (headline, bio, region, postcode), edit capability, subscription tier badge

### 2.3 Analytics

1. Navigate to `/dashboard/listings/{listingId}/analytics`
2. Observe: profile views, search appearances, enquiries received counters
3. Note: exact numbers vary (randomised during seed between 20-220 views, 50-550 appearances, 0-15 enquiries)

### 2.4 Enquiry Inbox

1. Navigate to enquiry inbox for Apex listing
2. Observe: 2 received enquiries
   - From admin user: "ARRI Alexa Mini LF availability" — status: responded (green)
   - From anonymous: "Camera package for short film" — status: unread (grey)
3. The responded enquiry shows response time of ~48 hours

---

## Journey 3: Admin (overview, support, billing, compliance, flows, events, commercial)

### 3.1 Admin Overview

1. Log in as `admin@callsheet.test`
2. Navigate to `/admin`
3. Observe: overview dashboard with 7 aggregate counts (listings, accounts, tickets, flows, errors, compliance, billing)
4. Sidebar shows 8 navigation items

### 3.2 Support Tickets

1. Navigate to admin support section
2. Observe 3 tickets:
   - **Open / High:** "Invoice discrepancy on Premium renewal" (Apex, demo user, SLA in 2 days)
   - **Assigned / Normal:** "Request to merge duplicate listing" (Green Spark, admin user, SLA in 5 days)
   - **Resolved / Low:** "Cannot access analytics — tier confusion" (Apex, resolved 3 days ago)
3. Note the churn risk indicator on Mark Thompson's listing (at_risk status visible in support detail)

### 3.3 Billing

1. Navigate to admin billing section
2. Observe: 1 billing hold on Mark Thompson — "Paddle subscription active but local tier shows free"
3. Hold expires in ~24 hours
4. Reconciliation status should show last run time (if reconciliation has been triggered)

### 3.4 Compliance

1. Navigate to admin compliance section
2. Observe: 1 open DSAR entry
   - Type: DSAR, Account: demo user
   - Received 5 days ago, deadline in 25 days
   - Reference: DSAR-2026-001

### 3.5 Orchestrated Flows

1. Navigate to admin flows section
2. Observe: 1 in-progress erasure flow
   - 6 steps total, step 1 (verify_identity) completed, step 2 (extract_account_data) in progress
   - Steps 3-6 pending (close_support_tickets, process_erasure, close_dsar_case, emit_erasure_completed)
   - Deadline: 28 days from now
   - Context shows DSAR reference and account ID
3. Note the skip constraint matrix: verify_identity, process_erasure, close_dsar_case are non-skippable

### 3.6 Failed Events

1. Navigate to admin events section
2. Observe: 3 event consumer errors
   - **Resolved:** subscription_tier_changed → commercial (UNIQUE constraint, resolved 2 days ago)
   - **Unresolved:** claim_approved → commercial (null pointer on subscriptionTier)
   - **Unresolved:** enquiry_submitted → commercial (connection terminated)
3. Can retry or resolve individual errors from this view

### 3.7 Commercial (S8 views)

1. Navigate to admin commercial section (revenue perception)
2. Observe: revenue metrics computed from seeded data
   - 3 paid listings (Apex premium, Mark standard, Green Spark premium, Brightside premium)
   - Churn analysis log shows 1 conversion and 1 churn event
   - Revenue health signals based on threshold evaluation

---

## Data Summary

| Entity | Count | Details |
|--------|-------|---------|
| Users | 2 | demo (user), admin (admin) |
| Listings | 6 | 1 owned by demo, 5 independent (3 companies, 2 freelancers) |
| Support tickets | 3 | 1 open, 1 assigned, 1 resolved |
| Compliance entries | 1 | Open DSAR, 25-day deadline |
| Billing holds | 1 | Mark Thompson, 24h expiry |
| Orchestrated flows | 1 | Erasure, 6 steps, in_progress at step 2 |
| Event errors | 3 | 1 resolved, 2 unresolved |
| Enquiry records | 4 | 2 received by demo listing, 2 sent by demo user |
| Shortlists | 1 | 3 items |
| Search history | 3 | Camera rental, post production, sound recordist |
| Churn risk | 1 | Mark Thompson, at_risk |
| Commercial state | 2 | Apex (premium, conversion triggers fired), Mark (standard, churn) |
| Churn analysis log | 3 | 2 conversions, 1 churn |
