// tRPC API route handler E2E — CH-CS-014 W2 AC-05 through AC-09
// Tests the /api/trpc/* endpoint wiring. Requires E2E_TEST_MODE=true.

import { test, expect, type APIRequestContext } from "@playwright/test"

const BASE = "http://localhost:3000"

async function resetState(request: APIRequestContext) {
  await request.post(`${BASE}/api/test/reset`)
  await request.delete(`${BASE}/api/test/emails`)
}

async function signUpAndSignIn(request: APIRequestContext) {
  await request.post(`${BASE}/api/auth/sign-up/email`, {
    data: {
      name: "TRPC Test User",
      email: "trpc-test@example.com",
      password: "securepassword123",
    },
  })
  const signinRes = await request.post(`${BASE}/api/auth/sign-in/email`, {
    data: {
      email: "trpc-test@example.com",
      password: "securepassword123",
    },
  })
  expect(signinRes.ok()).toBe(true)
}

function trpcUrl(procedure: string) {
  return `${BASE}/api/trpc/${procedure}`
}

test.describe("tRPC API route", () => {
  test.beforeEach(async ({ request }) => {
    await resetState(request)
  })

  test("GET taxonomy.getSectors returns sector data — public, no auth (AC-08)", async ({ request }) => {
    const res = await request.get(trpcUrl("taxonomy.getSectors"))
    expect(res.ok()).toBe(true)
    const body = await res.json()
    // tRPC wraps response in { result: { data: { json: ... } } }
    expect(body.result).toBeDefined()
    expect(body.result.data).toBeDefined()
  })

  test("POST search.query returns valid tRPC response (AC-05)", async ({ request }) => {
    const res = await request.post(trpcUrl("search.query"), {
      headers: { "content-type": "application/json" },
      data: { json: { query: "camera", filters: {} } },
    })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body.result).toBeDefined()
    expect(body.result.data).toBeDefined()
    const data = body.result.data.json
    // Search returns listings array (may be empty in test DB)
    expect(data).toHaveProperty("listings")
  })

  test("enquiry.listSent with auth session returns enquiry list (AC-06)", async ({ request }) => {
    await signUpAndSignIn(request)

    const res = await request.post(trpcUrl("enquiry.listSent"), {
      headers: { "content-type": "application/json" },
      data: { json: { limit: 10 } },
    })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body.result).toBeDefined()
    expect(body.result.data).toBeDefined()
  })

  test("protected procedure without auth returns UNAUTHORIZED (AC-07)", async ({ request }) => {
    // Fresh request context — no sign-in, no session cookies
    const res = await request.post(trpcUrl("enquiry.listSent"), {
      headers: { "content-type": "application/json" },
      data: { json: { limit: 10 } },
    })
    expect(res.ok()).toBe(false)
    const body = await res.json()
    expect(body.error).toBeDefined()
    expect(body.error.data.code).toBe("UNAUTHORIZED")
  })

  test("batch request resolves multiple procedures (AC-09)", async ({ request }) => {
    // tRPC batch: comma-separated procedure names in the URL
    const batchUrl = `${BASE}/api/trpc/taxonomy.getSectors,taxonomy.getSectors`
    const res = await request.get(batchUrl)
    expect(res.ok()).toBe(true)
    const body = await res.json()
    // Batch returns array of results
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(2)
    expect(body[0].result).toBeDefined()
    expect(body[1].result).toBeDefined()
  })
})
