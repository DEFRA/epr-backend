# 13. Defra ID

Date: 2025-10-08

## Status

Accepted

## Context

As a Defra digital service we need to ensure that public users are Authenticated to access our service
and Authorised to read/write data associated to their access within the service.

## Decision

As a foregone conclusion, we are required to use DefraID as it provides a consistent experience for users,
especially where those users access more than one Defra digital service.

```mermaid
sequenceDiagram

  actor user as User
  participant browser as Browser
  participant frontend as EPR Frontend
  participant backend as EPR Backend
  participant defraId as Defra ID

  Note over user,defraId: pEPR Service
  user->>browser: visit service
  browser->>frontend: request page
  frontend->>frontend: determine if user is authenticated
  Note over user,defraId: Defra ID
  frontend-->>browser: redirect to Defra ID
  alt user is not registered
    browser->>user: show user registration flow
    user-->>browser: complete registration
    browser->>defraId: submit registration
    defraId-->>browser: redirect to auth callback page
  end
  alt user is registered
    browser->>user: show user login flow
    user-->>browser: complete login
    browser->>defraId: submit login
    defraId-->>browser: redirect to auth callback page
  end
  Note over user,defraId: pEPR Service
  browser->>frontend: request token exchange
  frontend->>defraId: exchange code and state for tokens
  defraId-->>frontend: tokens returned
  frontend->>backend: Request endpoint with access token
  backend->>backend: verify token against DefraID public key
  backend->>backend: lookup user role
  alt request is authorised
    backend-->>frontend: Authorised
    frontend-->>browser: page with requested content
  else request is unauthorised
    backend-->>frontend: Unauthorised
    frontend-->>browser: page with access denied message
  end
```

[Relevant resources can be found here](https://eaflood.atlassian.net/wiki/spaces/MWR/pages/5952995350/Defra+ID)

## Consequences

Primarily, the consequences are positive in that a single centralised service is used for Authentication that provides a consistent experience for users.

That said, there are some [potential downsides documented in Confluence](https://eaflood.atlassian.net/wiki/spaces/MWR/pages/5966299368/Defra+ID+issues) for privacy reasons.
