// Better Auth catch-all route handler — SI §4, CS-WORK-034 AC-02
// Bridges createAuth() config to HTTP endpoints at /api/auth/*

import { toNextJsHandler } from "better-auth/next-js"
import { getAuthInstance } from "@/lib/auth-instance"

export const { GET, POST } = toNextJsHandler(getAuthInstance())
