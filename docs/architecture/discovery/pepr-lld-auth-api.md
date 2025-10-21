# pEPR: Low level design - API (epr-backend) Authentication & Authorisation

> [!WARNING]
> This document is a work in progress and is subject to change.

<!-- prettier-ignore-start -->

- [Overview](#overview)
- [Authentication](#authentication)
- [Authorisation](#authorisation)
<!-- prettier-ignore-end -->

## Overview

The API exposed by `epr-backend` must allow or prevent actions (reading or editing data) based on who the client (authentication) and what actions they are allowed to perform (authorisation).

There are two principal clients of the API

1. `epr-frontend`
   1. this is the application used by `Operators`
   2. requests to the API from this service will supply an access token minted by Defra ID
2. `epr-re-ex-admin-frontend`
   1. this is the application used by `Service Maintainers` and `regulators`
   2. requests to the API from this service will supply an access token minted by Entra ID

## Authentication

1. Requests to the API must supply a Bearer token (access token) via the `Authoriation` header
2. The API will verify the signature of the access token using the public signing key from either Entra ID or Defra ID
3. The verification will be performed using the `@hapi/jwt` library

```mermaid
sequenceDiagram

  participant client
  box EPR Backend
    participant router as Router
    participant hapi as @hapi/jwt<br/>'jwt'<br/>auth strategy
    participant route as Route handler<br/>code
  end
  participant aad as Entra ID
  participant defraId as Defra ID

  client->>router: GET /a-resource<br/>Authorization: Bearer <JWT>
  note over router: route protected with<br/>auth strategy: 'jwt'
  note over client,defraId: verify access token (authentication)
  router->>hapi: (forwards)

  alt JWT issued by Entra ID
    hapi->>aad: GET /well-known
    aad->>hapi: { jwks_uri }
    hapi->>aad: GET /{jwks_uri}
    aad->>hapi: public signing key
  else JWT issued by Defra ID
    hapi->>defraId: GET /well-known
    defraId->>hapi: { jwks_uri }
    hapi->>defraId: GET /{jwks_uri}
    defraId->>hapi: public signing key
  end
  note over hapi: check <JWT> signature with<br/>public signing key

  alt key not verified
	hapi->>client: 401
  else key verified
    note over client,defraId: check user role (authorisation)

    hapi->>hapi: lookup user roles
    alt user has required role(s) to access resource
      hapi->>route:  (forwards)
      route->>client: 200 {response data}
    else user does not have required role(s) to access resource
      hapi->>client: 403
    end

  end
```

## Authorisation

Initially a select group of team members will be assigned to the "service_maintainer" role

- these users will be identified by the email address on their (Entra ID) access token
- a list of (email addresses of) service maintainers will be supplied to the `epr-backend` application via config
- APIs built to support the admin UI will only be accessible to users with the service_maintainer role

We expect this simple authorisation approach to be short-lived - it enables launch of the admin UI service.

It will be replaced with a more sophisticated approach (details TBC) that additionally meets to the authorisation requirements for _operators_ and _regulators_
