# 13. Admin UI Authorisation MVP

Date: 2025-10-13

## Status

Proposed

## Context

After devising an approach to authentication with Entra Id for `epr-re-ex-admin-frontend`, we need to define an authorisation strategy for admin users as a first step towards a full RBAC implementation.

It's relevant that, in order to reduce risk in the project, we want to have a secure working authorisation mechanism in place as soon as possible, rather than coming up with a gold-plated solution upfront.

## Decision

We will implement a simple secret-based authorisation mechanism that hardcodes a list of allowed admin users in a CDP secret.

The structure of the of secret will look like this:

```json
{
  "systemAdmins": [
    "user1@defra.gov.uk",
    "user2@defra.gov.uk",
    "user3@defra.gov.uk",
    "user4@defra.gov.uk"
  ]
}
```

The email addresses in the `systemAdmins` array will be filled in with the email addresses of the team members' Entra Id accounts who need admin access to `epr-re-ex-admin-frontend`.

## Consequences

By choosing an MVP over a fully fledged solution we can implement an authorisation mechanism quickly while we work on defining the needs of the project with regards to roles and permissions.
