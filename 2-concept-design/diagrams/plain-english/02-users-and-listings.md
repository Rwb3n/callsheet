# Users and Listings: Who Owns What

Every user gets an account. Accounts can browse and search (buyer side) from day one. Listings are directory records for businesses and freelancers. A listing can exist without an owner (e.g. imported data). When a user claims a listing, they become its owner and can edit it.

```mermaid
erDiagram
    USER_ACCOUNT {
        string id "unique ID"
        string email "must be verified"
        string name "full name"
        string departments "areas of interest"
    }

    USER_ACCOUNT ||--o| BUYER_SIDE : "always active"
    BUYER_SIDE {
        string searches "past searches"
        string shortlists "saved favourites"
        string enquiries "messages sent"
    }

    USER_ACCOUNT ||--o| LOGIN : has
    LOGIN {
        string password "or social sign-in"
        boolean twoFactor "extra security"
    }

    USER_ACCOUNT ||--o{ LISTING : "can own many"

    LISTING {
        string id "unique ID"
        string owner "linked when claimed"
        string type "freelancer or company"
        string claimStatus "unclaimed, claimed, or disputed"
        string origin "signed up, imported, or reached out to"
    }

    LISTING ||--o| COMPANY_IDENTITY : has
    COMPANY_IDENTITY {
        string businessName
        string companiesHouseNumber
        string previousNames
    }

    LISTING ||--o| SUBSCRIPTION : has
    SUBSCRIPTION {
        string pricingTier "free, standard, premium, partner"
    }

    LISTING ||--o| PUBLIC_PROFILE : has
    PUBLIC_PROFILE {
        string headline
        string description
        string logo
        string website
        string photos "limited by pricing tier"
    }

    LISTING ||--o| TRUST_LEVEL : has
    TRUST_LEVEL {
        string badge "unclaimed to gold"
        string howVerified
        number trustScore
    }

    LISTING ||--o| SERVICES_OFFERED : has
    SERVICES_OFFERED {
        string categories "what they do"
        string genres "what industries"
    }

    LISTING ||--o| POPULARITY : has
    POPULARITY {
        number profileViews
        number searchAppearances
        number qualityScore "0 to 100"
    }

    LISTING ||--o| DATA_RIGHTS : has
    DATA_RIGHTS {
        boolean privacyNoticed "told about imported data"
        boolean noticeDisplayed "shown on their page"
    }
```
