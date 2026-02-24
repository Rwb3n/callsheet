# Pre-Draft Checklist Output Format

## File: `3-requirements/stress-tests/s{N}-pre-draft-checklist.md`

```markdown
# S{N} Pre-Draft Checklist — {Slice Name}

**Generated:** {date}
**Slice:** `slices/slice-{NN}-{name}/` (multi-file, S6+) or `slices/slice-{NN}-{name}.md` (single-file, S0–S5)
**Primary domain:** {domain}
**Upstream specs:** {list with versions}

---

## 1. Deferred Actions to Register

If ANY deferred actions are needed, add entries to SI §2.1 and §2.2 during drafting.

| Action | Params Type | Owner | Schedule | Retry | On Failure | Source |
|--------|-------------|-------|----------|-------|------------|--------|
| `{action_name}` | `{ field: Type }` | {domain} | {trigger} | `once`/`retry_3` | `log`/`alert_principal` | {concept design §X} |

**SI §2.1 entry:**
```typescript
{action_name}: { field: Type }
```

**SI §2.2 row:**
```
| {Domain} | `{action_name}` | {trigger description} | `{retry}` | `{onFailure}` |
```

## 2. Email Templates to Register

If ANY new templates, add to SI §5.2 and PP §4 during drafting. Update counts.

| Template ID | Trigger | Category | Unsubscribable | Owner |
|-------------|---------|----------|----------------|-------|
| `{template_id}` | {trigger} | {category} | Yes/No | {domain} |

**Current count:** {N} templates (SI §5.2). After this slice: {N+X}.

## 3. Event Emissions

Verify payload matches `EventPayloadMap` (SI §1.2). List all P1 fields.

| Event | Emitted By | Key Payload Fields | P1 Check |
|-------|-----------|-------------------|----------|
| `{event_type}` | {domain} | `{field1}`, `{field2}` | All present? |

## 4. Event Consumers

New consumers to register in `EVENT_CONSUMER_MATRIX`.

| Event | Consumer Domain | Mode | Handler Description |
|-------|----------------|------|---------------------|
| `{event_type}` | {domain} | sync/async | {description} |

## 5. Schema Amendments

New columns on existing tables. Include cumulative snapshot.

| Table | New Column | Type | Default | Source |
|-------|-----------|------|---------|--------|
| `{table}` | `{column}` | `{type}` | `{default}` | S{N} §{X} |

**Cumulative snapshot after S{N}:**
```typescript
// {table} — authoritative in S{M} §{Y}, amended by S{P}, S{Q}, S{N}
{column1}: {type}
{column2}: {type}
// ... all columns
```

## 6. Upstream Flags to Resolve

| Flag | Source | Description | Resolution Needed |
|------|--------|-------------|-------------------|
| S{X}-{Y} | S{X} §{Z} | {description} | {what this slice must do} |

## 7. Open Questions to Resolve

| # | Question | Expected Resolution |
|---|----------|-------------------|
| {Q-ID} | {question} | {what this slice decides} |
```
