// Better Auth config — SI §4, S0 §5
// Auth is infrastructure — does not belong to any sub-entity.
// accountId = Better Auth user.id — the cross-domain join key.

import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import type { EmailService } from "@/lib/email/types"

export type AuthSession = {
  accountId: string
  email: string
  emailVerified: boolean
  role: "user" | "admin"
  createdAt: string
}

export function createAuth(params: { db: unknown; emailService: EmailService }) {
  return betterAuth({
    database: drizzleAdapter(params.db as Parameters<typeof drizzleAdapter>[0], {
      provider: "pg",
    }),
    // Accept dev server on any localhost port (Next.js picks next available if 3000 is taken)
    trustedOrigins: process.env.NODE_ENV === "production"
      ? []
      : ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"],
    emailAndPassword: { enabled: true },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        await params.emailService.send({
          to: user.email,
          template: "email_verification",
          data: { verificationUrl: url },
          category: "transactional",
        })
      },
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          defaultValue: "user",
          input: false,
        },
      },
    },
  })
}
