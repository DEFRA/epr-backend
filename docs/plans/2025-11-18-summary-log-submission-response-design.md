# Summary Log Submission Response Design

**Date:** 2025-11-18
**Ticket:** PAE-474
**Context:** Frontend PR #191 requires backend to return submission status and accreditation number

## Problem

The frontend implements a successful submission page that displays after submitting a validated summary log. The page needs to show the accreditation number associated with the registration. However, the backend currently returns 202 Accepted with no response body.

The submission process is asynchronous (fire-and-forget worker pattern), so the frontend needs to poll until the submission completes.

## Solution Overview

Add a new `submitting` status to represent the period between submission initiation and completion. The POST /submit endpoint returns immediately with this status, and the frontend polls the GET endpoint until the status becomes `submitted`, at which point the accreditation number is included in the response.

## Design

### 1. Status Changes

**File:** `src/domain/summary-logs/status.js`

**New Status:**

- Add `SUBMITTING: 'submitting'` to `SUMMARY_LOG_STATUS` enum

**Status Transitions:**

- Allow `validated` → `submitting` (POST /submit endpoint)
- Allow `submitting` → `submitted` (Worker)

**Error Handling:**

- Keep existing pattern: log errors, don't update status
- If worker fails, status remains `submitting` (to be revisited later)

### 2. POST /submit Endpoint Changes

**File:** `src/routes/v1/organisations/registrations/summary-logs/submit/post.js`

**Current Behaviour:**

- Verifies status is `validated`
- Triggers worker
- Returns 202 Accepted with no body

**New Behaviour:**

- Verifies status is `validated`
- Updates summary log status to `submitting` using optimistic concurrency
- Triggers worker
- Returns 200 OK with `{ status: "submitting" }` and Location header

**Implementation Details:**

- After loading the summary log and verifying status is validated, update the status to `SUBMITTING` using optimistic concurrency
- Trigger the worker using the existing fire-and-forget pattern
- Return 200 OK with response body containing the new status
- Include Location header pointing to the GET endpoint for polling

### 3. Worker Changes

**File:** `src/workers/summary-logs/worker/worker-thread.js`

**Status:** No changes required. Worker already updates status from `submitting` to `submitted` on completion.

**Verification:** Ensure status transition logic allows `submitting` → `submitted`.

### 4. GET Endpoint Changes

**File:** `src/routes/v1/organisations/registrations/summary-logs/get.js`

**Current Behaviour:**

- Returns summary log with current status
- No accreditation number

**New Behaviour:**

- Returns summary log with current status
- When status is `submitted`: lookup and include accreditation number
- When status is NOT `submitted`: no accreditation number field

**Implementation Details:**

- After fetching the summary log, check if status is `SUBMITTED`
- If yes: lookup the registration using `organisationsRepository.findRegistrationById()`
- Extract accreditation number from the hydrated registration (registration.accreditation.accreditationNumber)
- Add accreditation number to response
- If no: return summary log as-is

**Dependencies:**

- Inject `organisationsRepository` into handler
- Use existing `findRegistrationById()` method which already hydrates the accreditation

**Edge Cases:**

- Registration not found: return `accreditationNumber: null`
- Registration has no accreditation: return `accreditationNumber: null`
- Accreditation has no number: return `accreditationNumber: null`

### 5. Test Fixture Updates

**File:** `src/data/fixtures/common/epr-organisations/sample-organisation-1.json`

**Changes:**

- Update accreditation `68f6a147c117aec8a1ab7495` to have `accreditationNumber: "87654321"`
- This accreditation is linked from registration `6507f1f77bcf86cd79943902`

**Rationale:**

- Allows manual testing of the full flow
- Frontend can submit a summary log for this registration and see the accreditation number

### 6. Test Updates

**File:** `src/routes/v1/organisations/registrations/summary-logs/submit/post.test.js`

- Update existing tests to expect 200 OK instead of 202 Accepted
- Expect response body: `{ status: "submitting" }`
- Expect Location header with summary log URL
- Add test: verify status updated to `submitting` in repository
- Add test: verify optimistic concurrency used

**File:** `src/routes/v1/organisations/registrations/summary-logs/get.test.js`

- Add test: when status is `submitted`, returns accreditation number
- Add test: when status is `submitting`, no accreditation number field
- Add test: when status is `validated`, no accreditation number field
- Add test: when status is `submitted` but registration not found, returns `accreditationNumber: null`
- Add test: when status is `submitted` but accreditation not found, returns `accreditationNumber: null`
- Add test: when status is `submitted` but accreditation has no number, returns `accreditationNumber: null`

**File:** `src/routes/v1/organisations/registrations/summary-logs/integration.test.js`

- Add end-to-end test:
  - Upload → Validate → Submit (check `submitting` status returned)
  - Poll GET until worker completes (status becomes `submitted`)
  - Verify accreditation number appears in response

**File:** `src/domain/summary-logs/status.test.js`

- Add tests for new status transitions:
  - `validated` → `submitting` allowed
  - `submitting` → `submitted` allowed
  - Invalid transitions to/from `submitting` throw errors

## Frontend Integration

**Frontend Flow:**

1. POST to `/submit`
2. Receives `{ status: "submitting" }` and Location header
3. Polls GET endpoint (from Location header)
4. While status is `submitting`: continue polling
5. When status becomes `submitted`: display accreditation number from response

## Data Model

**Registration → Accreditation Link:**

```json
{
  "registrations": [
    {
      "id": "6507f1f77bcf86cd79943902",
      "accreditationId": "68f6a147c117aec8a1ab7495"
    }
  ],
  "accreditations": [
    {
      "id": "68f6a147c117aec8a1ab7495",
      "accreditationNumber": "87654321"
    }
  ]
}
```

## Future Improvements

- Add failure status for submission errors (currently status stays `submitting` forever if worker fails)
- Consider caching accreditation number in summary log to avoid repeated lookups
- Add metrics for submission duration and failure rates
