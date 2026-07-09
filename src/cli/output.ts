// CLI output formatting — CS-WORK-103 AC-3
// JSON (default) or table (--format table) output for all commands

import Table from "cli-table3"
import chalk from "chalk"

export type OutputFormat = "json" | "table"

export function formatOutput(data: unknown, format: OutputFormat): string {
  if (format === "json") {
    return JSON.stringify(data, null, 2)
  }
  return formatTable(data)
}

function formatTable(data: unknown): string {
  if (Array.isArray(data)) {
    return formatArrayTable(data)
  }
  if (data !== null && typeof data === "object") {
    return formatObjectTable(data as Record<string, unknown>)
  }
  return String(data)
}

function formatArrayTable(rows: unknown[]): string {
  if (rows.length === 0) {
    return chalk.dim("(empty)")
  }
  const first = rows[0]
  if (first === null || typeof first !== "object") {
    // Primitive array — single column
    const table = new Table({ head: ["Value"] })
    for (const row of rows) {
      table.push([String(row)])
    }
    return table.toString()
  }
  // Object array — keys as columns
  const keys = Object.keys(first as Record<string, unknown>)
  const table = new Table({ head: keys })
  for (const row of rows) {
    const obj = row as Record<string, unknown>
    table.push(keys.map((k) => formatCell(obj[k])))
  }
  return table.toString()
}

function formatObjectTable(obj: Record<string, unknown>): string {
  const table = new Table()
  for (const [key, value] of Object.entries(obj)) {
    table.push({ [chalk.bold(key)]: formatCell(value) })
  }
  return table.toString()
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return chalk.dim("—")
  }
  if (typeof value === "object") {
    return JSON.stringify(value)
  }
  return String(value)
}
