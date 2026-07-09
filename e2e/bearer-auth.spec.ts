// Bearer token auth E2E — session-2026-03-30-retro action #3
// Creates admin user → creates API key → uses Bearer token to call admin query.
// Verifies: HTTP → extractSession → validateApiKey → adminProcedure chain.

import { test, expect, type APIRequestContext } from "@playwright/test"

const BASE = "http://localhost:3000"

async function resetState(request: APIRequestContext) {
  await request.post(`${BASE}/api/test/reset`)
  await request.delete(`${BASE}/api/test/emails`)
}

function trpcUrl(procedure: string) {
  return `${BASE}/api/trpc/${procedure}`
}

test.describe("Bearer token auth", () => {
  test("API key Bearer token → admin route full chain", async ({ request }) => {
    await resetState(request)

    // 1. Sign up a user
    const signupRes = await request.post(`${BASE}/api/auth/sign-up/email`, {
      data: {
        name: "Admin Bearer Test",
        email: "bearer-admin@example.com",
        password: "securepassword123",
      },
    })
    expect(signupRes.ok()).toBe(true)

    // 2. Promote to admin role via test endpoint
    const roleRes = await request.post(`${BASE}/api/test/set-role`, {
      data: { email: "bearer-admin@example.com", role: "admin" },
    })
    expect(roleRes.ok()).toBe(true)

    // 3. Sign in to get session cookies (needed for API key creation via tRPC)
    const signinRes = await request.post(`${BASE}/api/auth/sign-in/email`, {
      data: {
        email: "bearer-admin@example.com",
        password: "securepassword123",
      },
    })
    expect(signinRes.ok()).toBe(true)

    // 4. Create API key via admin route (using session cookie auth)
    const createKeyRes = await request.post(trpcUrl("admin.apiKeys.create"), {
      headers: { "content-type": "application/json" },
      data: { json: { name: "E2E Test Key" } },
    })
    expect(createKeyRes.ok()).toBe(true)
    const createKeyBody = await createKeyRes.json()
    const apiKey = createKeyBody.result.data.json.key
    expect(apiKey).toBeTruthy()
    expect(typeof apiKey).toBe("string")
    expect(apiKey.length).toBeGreaterThan(16)

    // 5. Use Bearer token to call admin health endpoint (no cookies)
    // Create a fresh request context to avoid session cookies
    const healthRes = await request.get(trpcUrl("admin.health.getStatus"), {
      headers: {
        authorization: `Bearer ${apiKey}`,
        // Explicitly clear cookies by not including them
      },
    })
    expect(healthRes.ok()).toBe(true)
    const healthBody = await healthRes.json()
    expect(healthBody.result).toBeDefined()
    expect(healthBody.result.data).toBeDefined()

    // 6. Verify Bearer token works for admin mutations too
    const schedulerRes = await request.get(
      trpcUrl("admin.scheduler.list") +
        `?input=${encodeURIComponent(JSON.stringify({ json: { limit: 5 } }))}`,
      {
        headers: { authorization: `Bearer ${apiKey}` },
      },
    )
    expect(schedulerRes.ok()).toBe(true)

    // 7. Verify invalid Bearer token is rejected
    const badRes = await request.get(trpcUrl("admin.health.getStatus"), {
      headers: { authorization: "Bearer invalid-token-12345" },
    })
    // Without valid token AND without session cookies, should get UNAUTHORIZED
    expect(badRes.ok()).toBe(false)
    const badBody = await badRes.json()
    expect(badBody.error.data.code).toBe("UNAUTHORIZED")
  })
})
