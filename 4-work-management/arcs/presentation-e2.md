---
id: presentation-e2
epoch: CS-E2
status: Complete
depends: null
chapters: [CH-CS-020, CH-CS-021, CH-CS-022, CH-CS-023, CH-CS-024, CH-CS-025]
---

# Arc: Presentation (CS-E2)

## Mission

Make the Next.js frontend production-ready. Resolve the 2 deployment blockers (homepage, error boundaries), wire the 6 stub pages, add SEO infrastructure, optimize images, and harden auth with middleware. Supersedes the remaining gaps from CS-E1's presentation arc (CH-CS-014).

## Relationship to CS-E1 Presentation Arc

CS-E1's `presentation` arc (CH-CS-014) wired the tRPC API surface, built the application shell, and retrofitted the buyer journey. It was a horizontal cut to make the backend reachable from a browser. CS-E2's presentation arc takes that foundation to production quality — error handling, SEO, real homepage content, stub page completion, image optimization, and auth hardening.

## Scope

### CH-CS-020: Deployment Blockers (~2 work items, ~8 AC)

| Work Item | Deliverables | Priority |
|-----------|-------------|----------|
| Error boundaries | Root `error.tsx`, `not-found.tsx`, `global-error.tsx`, dashboard `error.tsx`, admin `error.tsx`, `loading.tsx` skeletons | BLOCKER |
| Homepage | Hero section, value proposition, CTAs, pricing preview, responsive design, metadata | BLOCKER |

### CH-CS-021: Dashboard Completion (~3 work items, ~12 AC)

Wire the 4 dashboard stub pages to tRPC.

| Work Item | Page | tRPC Routes |
|-----------|------|-------------|
| Settings page | `/dashboard/settings` | `settings.getEmailPreferences`, `settings.updateEmailPreference`, `settings.initiateAccountClosure` |
| Notifications page | `/dashboard/notifications` | `notification.list`, `notification.dismiss`, `notification.markRead` |
| Subscription + analytics | `/dashboard/listings/[id]/subscription`, `/dashboard/listings/[id]/analytics` | `subscription.getSubscriptionStatus`, `dashboard.getListingDashboard` (analytics subset) |

### CH-CS-022: Admin Completion (~2 work items, ~10 AC)

Wire admin stub pages + new admin views from api-completion routes.

| Work Item | Pages | tRPC Routes |
|-----------|-------|-------------|
| Tasks page | `/admin/tasks` | `admin.tasks.list`, `admin.tasks.getDetail` |
| New admin views | Scheduler queue view, decision log viewer, user management | `admin.scheduler.list`, `admin.decisions.search`, `admin.users.list` |

### CH-CS-023: SEO + Metadata (~1 work item, ~6 AC)

| Work Item | Deliverables |
|-----------|-------------|
| SEO infrastructure | `sitemap.ts`, `robots.ts`, favicon, per-page metadata (title, description, OG), canonical URLs on public pages |

### CH-CS-024: Image Optimization + Config (~1 work item, ~5 AC)

| Work Item | Deliverables |
|-----------|-------------|
| Image optimization | Migrate `<img>` to `next/image`, `remotePatterns` for R2 domain in `next.config.ts`, security headers, output configuration |

### CH-CS-025: Auth Hardening (~1 work item, ~6 AC)

| Work Item | Deliverables |
|-----------|-------------|
| Middleware + ownership | `src/middleware.ts` for route protection (replace layout-level auth), listing ownership verification on dashboard routes, CSRF protection |

## Exit Criteria

- [ ] 0 stub pages remain (all wired to tRPC)
- [ ] Homepage has real content
- [ ] Error boundaries at root, dashboard, and admin levels
- [ ] `sitemap.xml` and `robots.txt` served
- [ ] All images use `next/image` with R2 remote patterns
- [ ] `middleware.ts` protects dashboard and admin routes
- [ ] Listing ownership enforced on dashboard listing pages
- [ ] All new pages have Playwright browser tests (Gate 1)
