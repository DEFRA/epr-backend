# 5. Admin UI

Date: 2025-09-12

## Status

Accepted

## Context

As a team building the EPR service we need to fulfill the needs of several types of priviledged actors in the space including administrators of the service and the Regulator.

## Decision

We have chosen to build an Admin UI (`epr-portal`) for the (Managing your Waste Responsibilities) service.

The goal of the service is to act as an administrative tool for both system administrators of `epr-backend` and for the Regulator of the Re/Ex side of EPR to perform their duties based on each user's authorisation level.

The service will have the following characteristics:

- It will be based on the CDP Node.js Frontend Template
- It will live in CDP's private zone with all users signing in via AAD/SSO
- The server part of the service will act as a backend for the frontend (BFF approach) taking care of
  auth flows, enforcing security policies where applicable and, potentially, a number of other tasks
- It will use a simple role-based access control model (RBAC) to provide the best user experience and prevent unnecessary requests to `epr-backend` from unauthorised users

The following diagram outlines how `epr-portal` fits in the overall architecture of the system.

```mermaid
flowchart TD;
    USER((User))
    SUPER-USER((Super User))
    REGULATOR((Regulator))

  classDef invisible opacity:0
  classDef adminBox fill:blue,stroke:lightblue,color:white

  subgraph protected zone
    subgraph PROTECTED-ZONE-NESTED
      subgraph epr-portal
        EPR-ADMIN-UI([EPR Admin UI])
        EPR-ADMIN-BFF(EPR Admin Backend For Frontend)
      end
      EPR-BACKEND{{EPR Backend}}
    end
  end

  subgraph public zone
    subgraph PUBLIC-ZONE-NESTED
      EPR-FRONTEND([EPR Frontend])
      EPR-BFF(EPR Backend For Frontend)
    end
  end

  PROTECTED-ZONE-NESTED:::invisible
  PUBLIC-ZONE-NESTED:::invisible
  epr-portal:::adminBox

  USER-. public access: Defra ID .->EPR-FRONTEND;
  REGULATOR-. restricted access: AAD SSO .->EPR-ADMIN-UI;
  SUPER-USER-. restricted access: AAD SSO .->EPR-ADMIN-UI;

  EPR-FRONTEND-->EPR-BFF;
  EPR-ADMIN-UI-->EPR-ADMIN-BFF;

  EPR-BFF--access authenticated endpoints -->EPR-BACKEND;
  EPR-ADMIN-BFF--access AAD SSO protected endpoints -->EPR-BACKEND;
```

## Consequences

What becomes easier or more difficult to do and any risks introduced by the change that will need to be mitigated.

Having an Admin UI in CDP's private space adds an additional layer of security to the system by preventing making access to the private network an additional requirement.

From the organisational point of view, it establishes a clear separation between the publicly and privately accessible functions while helping the product team to separate concerns and define parallel streams of works, which will help us divide our work.

The full scope of the project has not been defined yet and it's likely to evolve over time, but we believe there are no risks associated with creating an Admin UI as starting point for managing the needs of system administrators and the Regulator.
