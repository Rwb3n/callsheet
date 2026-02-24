// R2 Object Storage — SI §6, S0 §7
// Production implementation. Tests use InMemoryObjectStorageService.

import { ALLOWED_CONTENT_TYPES, MAX_UPLOAD_SIZE_BYTES } from "./types"
import type { ObjectStorageService } from "./types"

export function validateUpload(contentType: string, dataSize: number, maxSizeBytes: number): void {
  if (!ALLOWED_CONTENT_TYPES.includes(contentType as (typeof ALLOWED_CONTENT_TYPES)[number])) {
    throw new Error(`Disallowed content type: ${contentType}. Allowed: ${ALLOWED_CONTENT_TYPES.join(", ")}`)
  }
  if (dataSize > maxSizeBytes) {
    throw new Error(`Upload size ${dataSize} exceeds limit of ${maxSizeBytes} bytes`)
  }
}

// In-memory implementation for tests
export class InMemoryObjectStorageService implements ObjectStorageService {
  private objects = new Map<string, { data: Buffer | ReadableStream; contentType: string; access: "public" | "private" }>()
  private publicBaseUrl: string

  constructor(publicBaseUrl = "https://cdn.callsheet.test") {
    this.publicBaseUrl = publicBaseUrl
  }

  async upload(params: {
    key: string
    data: Buffer | ReadableStream
    contentType: string
    maxSizeBytes: number
    access: "public" | "private"
  }): Promise<{ url: string | null }> {
    const dataSize = Buffer.isBuffer(params.data) ? params.data.byteLength : 0
    validateUpload(params.contentType, dataSize, params.maxSizeBytes)

    this.objects.set(params.key, {
      data: params.data,
      contentType: params.contentType,
      access: params.access,
    })

    if (params.access === "public") {
      return { url: `${this.publicBaseUrl}/${params.key}` }
    }
    return { url: null }
  }

  async getSignedUrl(key: string, expiresIn: number): Promise<string> {
    if (!this.objects.has(key)) {
      throw new Error(`Object not found: ${key}`)
    }
    return `${this.publicBaseUrl}/${key}?token=test-signed&expires=${expiresIn}`
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key)
  }

  async listByPrefix(prefix: string): Promise<string[]> {
    return [...this.objects.keys()].filter((k) => k.startsWith(prefix))
  }

  async deleteByPrefix(prefix: string): Promise<{ deleted: number }> {
    const keys = await this.listByPrefix(prefix)
    for (const key of keys) {
      this.objects.delete(key)
    }
    return { deleted: keys.length }
  }

  async download(key: string): Promise<Buffer> {
    const obj = this.objects.get(key)
    if (!obj) throw new Error(`Object not found: ${key}`)
    if (!Buffer.isBuffer(obj.data)) throw new Error(`Object is not a Buffer: ${key}`)
    return obj.data
  }

  getStoredKeys(): string[] {
    return [...this.objects.keys()]
  }
}
