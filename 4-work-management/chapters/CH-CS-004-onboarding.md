---
id: CH-CS-004
title: Onboarding
arc: onboarding-and-claims
epoch: CS-E1
status: Complete
depends: [CH-CS-001, CH-CS-002]
work_items: [CS-WORK-013, CS-WORK-014, CS-WORK-015, CS-WORK-016, CS-WORK-017, CS-WORK-018, CS-WORK-019, CS-WORK-020, CS-WORK-023, CS-WORK-029]
---

# Chapter: Onboarding

## Problem

CALLSHEET needs three onboarding paths (freelancer, company, claim) that produce active listings from authenticated accounts. This is the first slice producing user-facing pages and the first to exercise the full listing creation flow end-to-end. The chapter also covers profile strength metering, progressive disclosure (email + in-app nurture sequence over 30 days), intelligent taxonomy suggestions, image variant generation, and Article 14 compliance lifecycle. The seed pipeline (4rfv import + Article 14 batch sending) is handled separately in CH-CS-003.

## Requirements

Source: `3-requirements/slices/slice-02-onboarding.md` (v2) -- 41 of 50 AC assigned to this chapter. Remaining 9 AC (4rfv import + Article 14 batch) assigned to CH-CS-003.

### Account Creation (5 AC)
AC-01 through AC-05: Better Auth signup, email verification, personalisation, anonymous enquiry linking, verified-email guard.

### Freelancer Path (5 AC)
AC-06 through AC-10: Freelancer listing creation with defaults, integrity checks, event emission, progressive disclosure scheduling, listing_live email.

### Company Path (5 AC)
AC-11 through AC-15: Company listing creation, Companies House lookup + auto-population, full integrity pipeline, flagged company suspension.

### Claim Path (7 AC)
AC-16 through AC-21, AC-45: Claim pre-population with fallback profile strength, endowment messaging, pre-claim snapshots (edits held, not applied), pending_review stub, claim-path progressive disclosure deferred to S3, snapshot cleanup scheduling + handler.

### Profile Strength (3 AC)
AC-29 through AC-31: Quality score completeness mapping, missing field identification with impact estimates, fallback field-presence check.

### Progressive Disclosure (6 AC)
AC-32 through AC-35, AC-48, AC-49: Email/notification handlers with suppression logic (completed actions, inactive listings, email preferences), Day 14 in-app prompt, Day 14 scheduling verification.

### Suggestions (3 AC)
AC-36 through AC-38: Curated taxonomy suggestions for 3 sectors, already-selected exclusion, generic fallback by listing count.

### Image Processing (4 AC)
AC-39 through AC-41, AC-50: 3 WebP variant generation, deterministic naming, original preservation, failure fallback to original.

### Article 14 Compliance (3 AC)
AC-42 through AC-44: Progress check handler (alert threshold, days/percentage computation), on-page notice removal on claim approval.

## Work Items

| ID | Title | ACs | Priority | Effort | Blocked By |
|---|---|---|---|---|---|
| CS-WORK-013 | Account creation and onboarding router | AC-01..05 (5) | critical | medium | -- |
| CS-WORK-014 | Freelancer listing creation | AC-06..10 (5) | high | medium | CS-WORK-013 |
| CS-WORK-015 | Company listing creation and CH lookup | AC-11..15 (5) | high | medium | CS-WORK-013 |
| CS-WORK-016 | Claim path and pre-claim snapshots | AC-16..21, AC-45 (7) | high | large | CS-WORK-013 |
| CS-WORK-017 | Profile strength meter | AC-29..31 (3) | medium | small | -- |
| CS-WORK-018 | Progressive disclosure handlers and emails | AC-32..35, AC-48..49 (6) | medium | medium | CS-WORK-014, CS-WORK-015 |
| CS-WORK-019 | Intelligent taxonomy suggestions | AC-36..38 (3) | medium | small | -- |
| CS-WORK-020 | Image processing pipeline | AC-39..41, AC-50 (4) | medium | medium | -- |
| CS-WORK-023 | Article 14 compliance handlers | AC-42..44 (3) | medium | small | CS-WORK-022 (CH-CS-003) |

**Total: 9 work items, 41 AC**

## Success Criteria

- [x] All 3 onboarding paths produce active listings with correct defaults and one-to-one rows
- [x] Integrity checks run before every listing creation; flagged companies suspended
- [x] `listing_created` event emitted for user-created listings; progressive disclosure scheduled
- [x] Profile strength meter returns percentage, level, and ranked next actions
- [x] Progressive disclosure handlers suppress irrelevant nudges (completed actions, inactive listings, unsubscribed)
- [x] Image upload produces 3 WebP variants; failure falls back to original
- [x] Article 14 progress monitoring alerts principal on schedule risk

## Dependency Graph

```
CS-WORK-013 (Account Creation) ──blocks──> CS-WORK-014 (Freelancer)
                                ──blocks──> CS-WORK-015 (Company)
                                ──blocks──> CS-WORK-016 (Claim)
CS-WORK-014 (Freelancer) ──blocks──> CS-WORK-018 (Progressive Disclosure)
CS-WORK-015 (Company)    ──blocks──> CS-WORK-018 (Progressive Disclosure)
CS-WORK-022 (CH-CS-003)  ──blocks──> CS-WORK-023 (Article 14 Handlers)
CS-WORK-017 (Profile Strength)    ── independent
CS-WORK-019 (Suggestions)         ── independent
CS-WORK-020 (Image Processing)    ── independent
```
