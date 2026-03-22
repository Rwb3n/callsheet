// Liveness service interfaces — S9 §2, injectable dependency points.
// Production wires real HTTP/DNS/API clients; tests inject stubs.

export interface WebsiteLivenessService {
  checkUrl(url: string): Promise<{ status: number } | { error: "DNS_RESOLUTION_FAILED" | "TIMEOUT" }>
}

export interface EmailLivenessService {
  checkMx(domain: string): Promise<{ records: string[] }>
  probeMailbox(email: string, mxHost: string): Promise<{ status: "valid" | "invalid"; code?: number }>
}

export interface CompaniesHouseLivenessService {
  getCompany(chNumber: string): Promise<{ status: string; name: string }>
}

export interface SocialLivenessService {
  checkUrl(url: string): Promise<{ status: number }>
}

export interface PostcodeLivenessService {
  validate(postcode: string): Promise<{ status: "valid" | "terminated" | "invalid" }>
}

export interface LivenessServices {
  website: WebsiteLivenessService
  email: EmailLivenessService
  companiesHouse: CompaniesHouseLivenessService
  social: SocialLivenessService
  postcode: PostcodeLivenessService
}
