// Auth flow E2E — CS-WORK-034 AC-04, AC-05
// Signup → verification email sent → verify token → login → session cookie valid.
// Closes S0 AC-21 (signup + verification email), AC-22 (login after verification), S2-AC-02 (email verification callback).

import { test, expect, type APIRequestContext } from "@playwright/test"

const BASE = "http://localhost:3000"

async function resetState(request: APIRequestContext) {
  await request.post(`${BASE}/api/test/reset`)
  await request.delete(`${BASE}/api/test/emails`)
}

test.describe("auth flow", () => {
  test("signup → verification email → verify → login → session (AC-04)", async ({ request }) => {
    await resetState(request)

    // 1. Sign up
    const signupRes = await request.post(`${BASE}/api/auth/sign-up/email`, {
      data: {
        name: "Test User",
        email: "test@example.com",
        password: "securepassword123",
      },
    })
    expect(signupRes.ok()).toBe(true)
    const signupBody = await signupRes.json()
    expect(signupBody.user.email).toBe("test@example.com")
    expect(signupBody.user.emailVerified).toBe(false)
    // Auto-sign-in returns a token (sendOnSignUp without requireEmailVerification)
    expect(signupBody.token).toBeTruthy()

    // 2. Verify email service was called with email_verification template (S0 AC-21)
    const emailsRes = await request.get(`${BASE}/api/test/emails`)
    expect(emailsRes.ok()).toBe(true)
    const { emails } = await emailsRes.json()
    expect(emails.length).toBeGreaterThanOrEqual(1)

    const verificationEmail = emails.find(
      (e: { template: string }) => e.template === "email_verification",
    )
    expect(verificationEmail).toBeDefined()
    expect(verificationEmail.to).toBe("test@example.com")

    // 3. Extract verification URL and verify email (S2-AC-02)
    const verificationUrl: string = verificationEmail.data.verificationUrl
    expect(verificationUrl).toContain("/verify-email?token=")

    // GET the verification endpoint — Better Auth verifies the token
    const verifyRes = await request.get(verificationUrl)
    expect(verifyRes.ok()).toBe(true)

    // 4. Sign in after verification (S0 AC-22)
    const signinRes = await request.post(`${BASE}/api/auth/sign-in/email`, {
      data: {
        email: "test@example.com",
        password: "securepassword123",
      },
    })
    expect(signinRes.ok()).toBe(true)
    const signinBody = await signinRes.json()
    expect(signinBody.token).toBeTruthy()
    expect(signinBody.user.emailVerified).toBe(true)

    // 5. Session cookie works — get-session returns user data
    const sessionRes = await request.get(`${BASE}/api/auth/get-session`)
    expect(sessionRes.ok()).toBe(true)
    const sessionBody = await sessionRes.json()
    expect(sessionBody.user.email).toBe("test@example.com")
    expect(sessionBody.session).toBeTruthy()
  })

  test("email verification sets emailVerified to true (AC-05)", async ({ request }) => {
    await resetState(request)

    // Sign up
    const signupRes = await request.post(`${BASE}/api/auth/sign-up/email`, {
      data: {
        name: "Verify User",
        email: "verify@example.com",
        password: "securepassword123",
      },
    })
    expect(signupRes.ok()).toBe(true)

    // Get verification URL from captured email
    const emailsRes = await request.get(`${BASE}/api/test/emails`)
    const { emails } = await emailsRes.json()
    const verificationEmail = emails.find(
      (e: { template: string }) => e.template === "email_verification",
    )
    expect(verificationEmail).toBeDefined()

    const verificationUrl: string = verificationEmail.data.verificationUrl

    // Verify email — token accepted, emailVerified set to true
    const verifyRes = await request.get(verificationUrl)
    expect(verifyRes.ok()).toBe(true)

    // Confirm emailVerified is true via sign-in
    const signinRes = await request.post(`${BASE}/api/auth/sign-in/email`, {
      data: {
        email: "verify@example.com",
        password: "securepassword123",
      },
    })
    expect(signinRes.ok()).toBe(true)
    const signinBody = await signinRes.json()
    expect(signinBody.user.emailVerified).toBe(true)
  })
})
