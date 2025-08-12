# 3. GOV.UK Notify

Date: 2025-08-11

## Status

Accepted

## Context

Our system needs to send emails as part of the organisation registration and accreditation process. These include confirmation emails to users and notifications to regulators.

To avoid building and maintaining our own email infrastructure, we integrate with [GOV.UK Notify](https://www.notifications.service.gov.uk/), a government-approved platform for sending transactional emails.

## Decision

We will use GOV.UK Notify to send system-generated emails triggered by form submissions. This allows us to:

- Centralise and manage email templates via the GOV.UK Notify dashboard
- Simplify integration via a standard API
- Use a secure, government-trusted delivery service

Emails are triggered after we receive submission data, and reference GOV.UK Notify templates by ID. We populate the required placeholders (e.g. organisation ID) and send a request via the GOV.UK Notify API.

To use GOV.UK Notify in this project:

- An email template must be created in the GOV.UK Notify dashboard
- We must provide GOV.UK Notify with a list of allowed email recipients (in non-live mode)
- The template’s ID is referenced in code and populated with submission data

> Template creation and access must be done via the GOV.UK Notify web interface. Developers will need access to the team account.

### Diagram: Email Trigger Flow

```mermaid
sequenceDiagram
    participant DEFRA_Forms as DEFRA Forms
    participant pEPR as pEPR Service
    participant GOVUK as GOV.UK Notify
    participant User as Email Recipient

    DEFRA_Forms->>pEPR: Submit form data
    pEPR->>pEPR: Generate org ID
    pEPR->>GOVUK: Send email using template ID + personalisation
    GOVUK-->>User: Deliver email
```

## Consequences

**Positive:**

- Reduces operational overhead by using a trusted, government-approved service
- Improves deliverability and compliance with government standards
- Provides a centralised place for template management

**Negative / Trade-offs:**

- Development in non-live mode is restricted to pre-approved email addresses
- Template changes require manual updates via the GOV.UK Notify dashboard
