// CLI config management — CS-WORK-103 AC-2
// Read/write ~/.callsheet/config.json

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { homedir } from "os"

export type CLIConfig = {
  apiUrl: string
  token: string | null
}

const DEFAULT_CONFIG: CLIConfig = {
  apiUrl: "http://localhost:3000",
  token: null,
}

export function getConfigDir(): string {
  return join(homedir(), ".callsheet")
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.json")
}

export function readConfig(): CLIConfig {
  const configPath = getConfigPath()
  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG }
  }
  const raw = readFileSync(configPath, "utf-8")
  const parsed = JSON.parse(raw) as Partial<CLIConfig>
  return {
    apiUrl: parsed.apiUrl ?? DEFAULT_CONFIG.apiUrl,
    token: parsed.token ?? DEFAULT_CONFIG.token,
  }
}

export function writeConfig(config: CLIConfig): void {
  const dir = getConfigDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2) + "\n", "utf-8")
}

export function updateConfig(updates: Partial<CLIConfig>): CLIConfig {
  const config = readConfig()
  const updated = { ...config, ...updates }
  writeConfig(updated)
  return updated
}
