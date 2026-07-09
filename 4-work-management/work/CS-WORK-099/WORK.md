---
id: CS-WORK-099
title: API key infrastructure
chapter: CH-CS-016
arc: api-completion
epoch: CS-E2
status: done
closed: 2026-03-30
effort: medium
blocked_by: []
acceptance_criteria:
  - id: AC-1
    description: "api_keys table exists with id, accountId, name, keyHash, keyPrefix, scopes, lastUsedAt, revokedAt, createdAt"
    test_type: integration
  - id: AC-2
    description: "generateApiKey() returns { key, keyPrefix, keyHash } where key is a crypto-random 32-byte hex, keyPrefix is first 8 chars, keyHash is SHA-256"
    test_type: unit
  - id: AC-3
    description: "validateApiKey(keyHash) looks up the api_keys table, returns the associated AuthSession or null"
    test_type: integration
  - id: AC-4
    description: "tRPC context creation accepts Authorization: Bearer header, validates API key, constructs AuthSession with the key owner's role"
    test_type: integration
  - id: AC-5
    description: "Revoked keys are rejected (revokedAt not null)"
    test_type: integration
  - id: AC-6
    description: "lastUsedAt is updated on each successful validation"
    test_type: integration
---

# CS-WORK-099: API key infrastructure

## Deliverables

- [x] `src/db/schema/shared.ts` — api_keys table
- [x] `src/lib/api-keys/index.ts` — generateApiKey(), hashKey(), validateApiKey()
- [x] `src/lib/api-keys/__tests__/api-keys.test.ts` — 5 unit tests for key generation
- [x] `src/lib/api-keys/__tests__/api-keys.integration.test.ts` — 6 integration tests for validation
