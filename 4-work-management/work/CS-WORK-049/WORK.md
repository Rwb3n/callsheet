---
template: work_item
id: CS-WORK-049
title: "Implement account settings and feature gating UI"
type: feature
status: active
owner: null
created: 2026-02-24
spawned_by: null
spawned_children: []
chapter: CH-CS-007
arc: provider-experience
epoch: CS-E1
closed: null
priority: medium
effort: medium
traces_to:
  - REQ-CS-PROV-007
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-05-provider-experience.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/platform-and-product.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/commercial-and-revenue.md
acceptance_criteria:
  - "AC-38: Email preferences page displays all 4 subscribable categories with current opt-in/opt-out state"
  - "AC-39: Updating email preference immediately changes delivery behaviour (SI §5.3 enforcement)"
  - "AC-40: Account closure initiation starts orchestrated flow (flowType: closure)"
  - "AC-41: Account closure for account with active listings and subscriptions completes all 6 steps (archive, cancel, anonymise, delete/defer, deactivate, emit)"
  - "AC-42: mapFeatureAccessToUI returns correct gate states for each tier (free, standard, premium, partner)"
  - "AC-43: Locked feature sections render Upgrade prompt with link to pricing page"
  - "AC-44: Feature access context updates immediately after subscription_tier_changed event (no page reload required after webhook processes)"
  - "AC-46: mapFeatureAccessToUI maps prioritySupport field correctly (Partner: available, others: locked) [S5-ST-8]"
blocked_by: [CS-WORK-043]
blocks: []
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-24T00:00:00
    exited: null
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S5
  spec_sections: "SI §5.3 (email preferences), PP §5 (account closure), CR §4.1 (TIER_LIMITS/FeatureAccess)"
version: "2.0"
generated: 2026-02-24
last_updated: 2026-02-24T00:00:00
---

# CS-WORK-049: Implement account settings and feature gating UI

## Context

Account settings page (email preferences + closure initiation) and the `mapFeatureAccessToUI` pure function that drives feature gate rendering across the entire dashboard. Email preferences are stored as JSONB in `account_profiles` — the settings router reads/writes individual category flags. Account closure triggers the PP-orchestrated 6-step flow via `startOrchestratedFlow`. `mapFeatureAccessToUI` maps CR's `FeatureAccess` to UI gate states (`available`/`locked`/`upgrade_prompt`) including `prioritySupport` (S5-ST-8).

**Type alignment:** Email preferences stored as JSONB in `account_profiles.emailPreferences` at `src/db/schema/accounts.ts` with shape `{ enquiry_notification, listing_status, profile_nudge, conversion_marketing }` (all boolean, default true). `FeatureAccess` at `src/domains/commercial/subscription/feature-access.ts` extends `TierLimits` — includes `prioritySupport: boolean`. `startOrchestratedFlow` exists at `src/lib/flows/`.

## Deliverables

- [ ] `src/app/dashboard/settings/page.tsx` — Account settings page (email preferences + closure button)
- [ ] `src/server/routers/settings.ts` — `createSettingsRouter(deps)` with `getEmailPreferences`, `updateEmailPreference`, `initiateAccountClosure`
- [ ] `src/domains/platform/dashboard/map-feature-access-to-ui.ts` — `mapFeatureAccessToUI` pure function
- [ ] `src/domains/platform/dashboard/__tests__/map-feature-access-to-ui.test.ts` — Unit tests for AC-42, AC-46
- [ ] `src/server/routers/__tests__/settings.integration.test.ts` — Integration tests for AC-39, AC-40, AC-41

## References

- `3-requirements/slices/slice-05-provider-experience.md` §10 Account Settings, §11 Feature Access UI Mapping
- `3-requirements/interfaces/shared-infrastructure.md` §5.3 (email preferences)
- `3-requirements/interfaces/platform-and-product.md` §5 (account closure)
- `3-requirements/interfaces/commercial-and-revenue.md` §4.1 (TIER_LIMITS, FeatureAccess)
