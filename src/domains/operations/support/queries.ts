// Operations query interface: hasActiveTicket — Ops §3.1, CS-WORK-058 AC-2.9, AC-2.10
// D&L calls this before suspension and decay signal emission.

import { eq, and, inArray, desc } from "drizzle-orm"
import { supportTickets } from "@/db/schema/operations"
import type { Db } from "@/db/types"

export type ActiveTicketRecord = {
  ticketId: string
  category: string
  openedAt: Date
}

export async function hasActiveTicket(
  db: Db,
  listingId: string,
): Promise<ActiveTicketRecord | null> {
  const [row] = await db
    .select({
      ticketId: supportTickets.id,
      category: supportTickets.category,
      openedAt: supportTickets.createdAt,
    })
    .from(supportTickets)
    .where(
      and(
        eq(supportTickets.listingId, listingId),
        inArray(supportTickets.status, ["open", "assigned"]),
      ),
    )
    .orderBy(desc(supportTickets.createdAt))
    .limit(1)

  return row ?? null
}
