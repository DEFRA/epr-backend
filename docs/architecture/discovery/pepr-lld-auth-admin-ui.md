# pEPR: Low level design - Admin UI Authentication & Authorisation

<!--toc:start-->

- [pEPR: Low level design - Admin UI Authentication & Authorisation](#pepr-low-level-design-admin-ui-authentication-authorisation)
  - [Overview](#overview)
  - [User groups](#user-groups)
  - [Sign in](#sign-in)
    - [Sign in user journey](#sign-in-user-journey)
    - [Sign in AAD flow](#sign-in-aad-flow)
  - [Sign out](#sign-out)
    - [Sign out user journey](#sign-out-user-journey)
    - [Sign out AAD flow](#sign-out-aad-flow)
  - [Session management](#session-management)
  <!--toc:end-->

> [!WARNING]
> This document is a work in progress and is subject to change.

<!-- prettier-ignore-start -->

- [Overview](#overview)
- [User groups](#user-groups)
- [Sign in](#sign-in)
  - [Sign in user journey](#sign-in-user-journey)
  - [Sign in AAD flow](#sign-in-aad-flow)
- [Sign out](#sign-out)
  - [Sign out user journey](#sign-out-user-journey)
  - [Sign out AAD flow](#sign-out-aad-flow)
- [Session management](#session-management)
  <!-- prettier-ignore-end -->

## Overview

The Admin UI service is only accessible to users on the Defra internal network - a landing page is accessible without requiring the user to be signed in.

Access to the functional parts of the service are protected as follows

- **Authentication** is via Microsoft Azure Active Directory (AAD)
  - Users sign in to the service via Single-Sign-On to Defra's AAD tenant
- **Authorisation** is managed within the service
  - A signed-in user is identified from their AAD details
  - The service internally maps the user to one or more _user groups_
- **Role based access control (RBAC)** permits access to a specific user groups on a per page basis

## User groups

The user groups are

1. `service maintainers`
1. `regulators`

See [HLD](./pepr-hld.md#who-is-using-this-service) for a description of the roles/responsibilities of these user groups

## Sign in

To sign in to the service the user is re-directed to AAD to perform single sign on, where

- the user signs in to AAD with their AAD username + password
- upon sign-in they are re-directed back to the service
- the service exchanges tokens with AAD (allowing it to identify the user)

The AAD sign-in URL is

`https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize?client_id={clientId}`

- `tenantId` = a "tenant" set up within Entra ID
  - Use "DefraDev" tenant to sign in to our app in `local|dev|test` environments
  - Use "Defra" tenant to sign in to our app in `prod` environment
- `clientId` = an identifier for "our app" - this is known to AAD, ie has been created in Entra ID within the specific tenant
  - A shared value is used across the `local`, `dev` and `test` environments (as configured in the "DefraDev" tenant)
  - Another value is used in the `prod` environment (as configured in the "Defra" tenant)

### Sign in user journey

> [!NOTE]
> This represents the initial (simplest) journey being built - it is expecteded to change in future iterations to provide an improved user experience

```mermaid
flowchart TD;
  User([User])

  landing([Show landing page content])
  landing-sign-in{is user logged in?}

  protected([Show protected page content])
  protected-unauthorised(Show not authorised content<br/>Present Sign In button)
  protected-sign-in{is user logged in?}

  AAD

  User--Access landing page-->landing-sign-in
  landing-sign-in--N-->landing
  landing-sign-in--Y-->landing

  User--Access protected page-->protected-sign-in
  protected-sign-in--N-->protected-unauthorised
  protected-sign-in--Y-->protected

  protected-unauthorised--Click Sign-In button-->AAD
  AAD--User signs in<br/>& redirected to landing page-->landing-sign-in
```

### Sign in AAD flow

The interaction between the service and AAD is orchestrated using `@hapi/bell` and `@hapi/cookie` plugins

```mermaid
sequenceDiagram

Actor U as User Browser
box Frontend
  participant router as Router
  participant cookie as @hapi/cookie<br/>'session'<br/>auth strategy
  participant bell as @hapi/bell<br/>'entra-id'<br/>auth strategy
  participant route as Route handler<br/>code
end
participant AAD as Azure AD


U->>router: GET /some-page
note over router: route protected with 'session' strategy
router->>cookie: (forward to)
note over cookie: check for "auth cookie"<br/>check for sessionId in "auth cookie"<br/>check for session data in cache
alt User signed in
  cookie->>route: (forward to)
  route->>U: <html>Page content</html>
else User not signed in
  cookie->>U: 302
  U->>router: GET /auth/sign-in
  note over router: route protected with 'entra-id' strategy
  router->>bell: (forward to)
  bell->>U: 302
  U->>AAD: GET /{tenantId}/oauth2/v2.0/authorize<br/>?client_id={client-id}<br/>&redirect_uri=/auth/callback<br/>&...
  AAD->>U: <html>Login form</html>
  Note over U: enter user name + password
  U->>AAD: Submit form
  AAD->>U: 302
  U->>router: GET /auth/callback<br/>?code={one-time-usage-code}<br/>&...
  note over router: route protected with 'entra-id' strategy
  router->>bell: (forward to)
  bell->>AAD: POST /{tenantId}/oauth2/v2.0/token<br/>?client_id={client-id}<br/>&client_secret={client-secret}<br/>&code={one-time-usage-code}<br/>&...
  AAD->>bell: User token
  Note over bell: validate user token<br/>extract user details<br/>add user details to request object
  bell->>route: (forward to)
  note over route: generate sessionId<br/>map user details to session data<br/>populate cache with session data<br/>populate "auth cookie" with sessionId
  route->>U: 302: /some-page
end
```

## Sign out

To sign out of the service the user is re-directed to AAD to perform single sign on, where

- the user signs in to AAD with their AAD username + password
- upon sign-out they are re-directed back to the service

The AAD sign-in URL is

`https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/logout?post_logout_redirect_uri={serviceUrl}`

### Sign out user journey

```mermaid
flowchart TD;
  User([User])
  SignOut[Click sign out button]
  AAD(AAD)
  landing([Show landing page content])


  User-->SignOut
  SignOut-->AAD
  AAD--User signs out<br/>& redirected to service-->landing
```

### Sign out AAD flow

Pressing the sign out button takes the user to `/auth/sign-out` which orchestrates the sign-out flow (and clears data setup and read by the `@hapi/bell` and `@hapi/cookie` plugins during sign in).

```mermaid
sequenceDiagram

Actor U as User Browser
box Frontend
  participant router as Router
  participant route as Route handler<br/>code
end
participant AAD as Azure AD

U->>router: GET /auth/sign-out
router->>route: (forward to)
note over route: evict session data from cache<br/>clear "auth cookie"
route->>U: 302
U->>AAD: GET /{tenantId}/oauth2/v2.0/logout<br/>?post_logout_redirect_uri={redirectUrl}
AAD->>U: <html>Logouot form</html>
U->>AAD: Submit form
AAD->>U: 302
U->>router: GET /{redirectUrl}
```

## Session management

An object with user session details is created and saved to server-side storage on a successful sign-in and removed on sign-out.

The `@hapi/yar` plugin is used to manage those sessions and link them to the corresponding session cookies. `@hapi/yar` delegates the actual storage functionality to the `@hapi/catbox` plugin which is configured to use Redis for server-side storage.

During sign-in, the user session is created when `/auth/callback` is called, using the information in the auth token received from AAD.

`@hapi/cookie` ensures the user session information is available as context in every successive request to Admin UI when a user is authenticated.

During sign-out, the user session is removed when `/auth/sign-out` is called.
