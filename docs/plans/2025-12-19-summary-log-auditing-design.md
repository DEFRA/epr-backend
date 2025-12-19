# Summary Log Auditing and Observability

**Ticket:** [PAE-758](https://eaflood.atlassian.net/browse/PAE-758)
**Date:** 2025-12-19
**Status:** Draft

## Overview

Add audit logging and metrics to summary log operations in epr-backend, following the pattern established in the admin frontend (PR #165).

## Scope

### 1. Audit Events

Record audit events for user-initiated actions only. Each event is recorded to both the CDP auditing service (`@defra/cdp-auditing`) and the `system-logs` MongoDB collection.

| Action | Trigger                            | User Context                  |
| ------ | ---------------------------------- | ----------------------------- |
| Upload | User initiates summary log upload  | From request auth credentials |
| Submit | User submits validated summary log | From request auth credentials |

**Audit payload structure:**

- `event.category`: `'summary-log'`
- `event.action`: `'upload'` or `'submit'`
- `context`: `{ summaryLogId, organisationId, registrationId }`
- `user`: `{ id, email, scope }`

### 2. Status Transition Metrics

Record a metric each time a summary log changes status. Uses AWS Embedded Metrics via the existing `metricsCounter` helper.

| Status                       | When Recorded                                           |
| ---------------------------- | ------------------------------------------------------- |
| `summaryLogPreprocessing`    | Upload initiated, file being processed                  |
| `summaryLogRejected`         | File rejected by CDP Uploader (virus, wrong type, etc.) |
| `summaryLogValidating`       | File uploaded, validation starting                      |
| `summaryLogInvalid`          | Validation completed with errors                        |
| `summaryLogValidated`        | Validation passed                                       |
| `summaryLogSubmitting`       | User triggered submission                               |
| `summaryLogSubmitted`        | Submission completed successfully                       |
| `summaryLogSuperseded`       | Replaced by newer upload                                |
| `summaryLogValidationFailed` | System error during validation                          |

**Metric naming convention:** camelCase (e.g. `summaryLogValidated`), matching admin frontend pattern.

### 3. Waste Record Metrics

Record counts of waste records created and updated during submission, with a dimension for the waste record type.

| Metric                | Description                                              |
| --------------------- | -------------------------------------------------------- |
| `wasteRecordsCreated` | Count of new waste records created                       |
| `wasteRecordsUpdated` | Count of existing waste records updated with new version |

**Dimension:** `wasteRecordType` with values: `received`, `processed`, `sentOn`, `exported`

This allows both aggregate views (total records created) and drill-down by type in CloudWatch/Grafana.

### 4. Pipeline Timing Metrics

Record duration metrics for key pipeline stages to provide visibility into performance.

| Metric                         | Description                                  | Unit         |
| ------------------------------ | -------------------------------------------- | ------------ |
| `summaryLogValidationDuration` | Time for validation pipeline to complete     | Milliseconds |
| `summaryLogSubmissionDuration` | Time for submission/sync process to complete | Milliseconds |

**Note:** Upload duration is excluded as it primarily measures CDP Uploader time (external).

## Design Decisions

| Decision             | Choice                                  | Rationale                                                      |
| -------------------- | --------------------------------------- | -------------------------------------------------------------- |
| Audit storage        | Both CDP audit + system-logs collection | Matches existing backend pattern for organisation updates      |
| Metric naming        | camelCase                               | Matches admin frontend pattern (e.g. `signInSuccess`)          |
| Waste record metrics | Counts with dimension                   | Allows aggregate and drill-down views without metric explosion |
| Timing approach      | Inline measurement                      | Simple, no abstraction overhead, matches codebase style        |

## Acceptance Criteria

- [ ] Audit event recorded when user initiates summary log upload
- [ ] Audit event recorded when user submits summary log
- [ ] Metric recorded for each summary log status transition
- [ ] Metric recorded for waste records created (with count and type dimension)
- [ ] Metric recorded for waste records updated (with count and type dimension)
- [ ] Duration metric recorded for validation pipeline
- [ ] Duration metric recorded for submission process
- [ ] Audit events appear in `system-logs` collection with correct user details
- [ ] 100% test coverage maintained

## References

- Admin frontend implementation: https://github.com/DEFRA/epr-re-ex-admin-frontend/pull/165
- Existing audit pattern: `src/auditing/index.js`
- Existing metrics helper: `src/common/helpers/metrics.js`
