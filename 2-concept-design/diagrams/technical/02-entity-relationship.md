# 2. Data & Listings: Entity Relationship Model

`Account` (user) and `Listing` (directory record) are independent entities that converge on claim. An Account can manage many Listings (0..N). A Listing has 0..1 Account.

```mermaid
erDiagram
    ACCOUNT {
        text id "Better Auth (text, not uuid)"
        string email "verified"
        string fullName
        text_array departments
    }

    ACCOUNT ||--o| BUYER_FACET : "always active"
    BUYER_FACET {
        json searchHistory
        json shortlists
        json enquiriesSent
    }

    ACCOUNT ||--o| AUTHENTICATION : has
    AUTHENTICATION {
        string pwdHash "or SSO"
        boolean mfaEnabled
    }

    ACCOUNT ||--o| SUPPRESSION : "comms phase 1"
    SUPPRESSION {
        timestamp suppressedAt
        string suppressionReason
    }

    ACCOUNT ||--o{ LISTING : "0..N manages"

    LISTING {
        uuid id
        uuid accountId "links when claimed"
        enum entityType "freelancer | company | ..."
        enum claimStatus "unclaimed | claimed | disputed"
        enum source "organic | import | outreach"
    }

    LISTING ||--o| IDENTITY : has
    IDENTITY {
        string name
        string companiesHouseNum
        string formerlyKnownAs
    }

    LISTING ||--o| COMMERCIAL_FACET : has
    COMMERCIAL_FACET {
        string budgetTier
        string subscriptionTier
        string paddleSubId
    }

    LISTING ||--o| PROFILE : has
    PROFILE {
        string headline
        string bio
        string logo_headshot
        string websiteUrl
        json media "max by tier"
    }

    LISTING ||--o| VERIFICATION : has
    VERIFICATION {
        enum tier "unclaimed to premium_verified"
        date lastCheckDate
        string method
        number verificationScore
    }

    LISTING ||--o| CAPABILITIES : has
    CAPABILITIES {
        json taxonomyTags
        json worksIn "genres"
        json transactionTypes
    }

    LISTING ||--o| ENGAGEMENT : has
    ENGAGEMENT {
        number profileViews
        number searchAppearances
        number qualityScore
    }

    LISTING ||--o| GDPR_ART14 : has
    GDPR_ART14 {
        boolean article14NoticeSent
        boolean article14Displayed
    }
```
