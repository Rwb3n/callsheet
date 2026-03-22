// D&L §3.2 — shared engagement counter query
// Owns the canonical DB read for the 3 core counters.
// Consumers: conversion-triggers, winback-evaluation, enquiry-submitted consumer.

import { eq } from "drizzle-orm"
import type { Db } from "@/db/types"
import { engagements } from "@/db/schema/data-and-listings"

export type EngagementCounters = {
  profileViews: number
  searchAppearances: number
  enquiriesReceived: number
}

export async function getEngagementCounters(db: Db, listingId: string): Promise<EngagementCounters> {
  const [row] = await db.select().from(engagements).where(eq(engagements.listingId, listingId)).limit(1)
  if (!row) return { profileViews: 0, searchAppearances: 0, enquiriesReceived: 0 }
  return {
    profileViews: row.profileViews,
    searchAppearances: row.searchAppearances,
    enquiriesReceived: row.enquiriesReceived,
  }
}
