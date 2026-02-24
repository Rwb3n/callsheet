// Object storage types — SI §6

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024 // 10MB [SI §6 NFR]

export const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const // no SVG — XSS risk [SI §6]

export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number]

export interface ObjectStorageService {
  upload(params: {
    key: string
    data: Buffer | ReadableStream
    contentType: string
    maxSizeBytes: number
    access: "public" | "private"
  }): Promise<{ url: string | null }>

  getSignedUrl(key: string, expiresIn: number): Promise<string>

  delete(key: string): Promise<void>

  listByPrefix(prefix: string): Promise<string[]>

  deleteByPrefix(prefix: string): Promise<{ deleted: number }>

  download(key: string): Promise<Buffer>
}
