# 7. Parsing Excel Summary log

Date: 2025-09-11

## Status

Proposed

## Context

Our system needs to accept summary logs from reprocessors, submitted as Excel spreadsheets.  
These contain information on tonnage, materials, and calculations relating to packaging and recycling exports.

The requirements are:

- Parse Excel spreadsheets into structured JSON.
- Validate the data against business rules (e.g. required fields, totals, material codes).
- Provide users with a preview and approval step before persistence.
- Retain auditability and security in line with GOV.UK and Defra standards.
- Ensure that incomplete, failed, or abandoned submissions do not leave behind orphaned files or inconsistent states.

We already use Joi for validation within the backend, and will continue to do so.  
The open question is where parsing should occur — in the frontend (browser) or backend (server).

## Decision

We will use **Backend Parsing and Validation**.  
This ensures files are virus scanned, parsed centrally, and retained for audit purposes.  
It aligns with compliance and security requirements, despite slower feedback and increased backend load.

### Backend Parsing and Validation

- Flow
  1. User uploads Excel file → sent to backend.
  2. File stored in S3/CDP uploader, where virus scanning occurs.
  3. Backend parses file with [ExcelJS](https://github.com/exceljs/exceljs).
  4. Parsed data converted to JSON.
  5. Backend applies validation rules (Joi).
  6. Preview/approval screen shown to user.
  7. Both raw Excel and validated JSON stored once submission is confirmed.

- Error and Expiry Handling
  - If validation fails → file remains in temporary S3 location. Expired or failed files are subject to automated cleanup (e.g. lifecycle policy, delete after 24h).
  - If session expires/closes before confirmation → file is not promoted to “final” storage. Cleanup policy removes unsubmitted files.

- Pros
  - Stronger security: uploaded files are virus scanned before processing.
  - Reliable handling of large files.
  - Centralised business logic in backend (single source of truth).
  - Retains evidence by storing original Excel (for confirmed submissions only).

- Cons
  - Slower feedback loop (upload + scan + parse).
  - Higher backend resource usage.
  - Requires S3 cleanup strategy for incomplete/failed submissions.
  - Increased storage requirements.
  - Requires local replication or mocking of S3 for development and testing.

### Option – Alternative consideration Frontend Parsing, Backend Validation

- Flow
  1. User uploads Excel file in browser.
  2. Browser parses the file directly using [SheetJS](https://github.com/SheetJS/sheetjs).
  3. Parsed data is converted to JSON in the browser.
  4. JSON is sent to the backend.
  5. Backend applies validation rules (Joi).
  6. Validated data returned for preview/approval.

- Error and Expiry Handling
  - If validation fails → frontend prompts user to correct and re-upload.
  - If session expires/closes → no files are stored (Excel never leaves browser). Nothing persists.

- Pros
  - No Excel file is ever uploaded → reduced backend file handling and no need for virus scanning.
  - Fast feedback for users (parsing occurs locally).
  - Backend only receives structured JSON (lighter processing).
  - Easier local development — no extra dependencies beyond Node.js and Excel parsing library.

- Cons
  - Browser performance may degrade with large files.
  - Business logic split between frontend (parsing) and backend (validation).
  - No copy of the original Excel retained for audit trail.

---

## Consequences

- Uploaded files will be stored in S3 via CDP Uploader.
- Backend will handle parsing and validation with ExcelJS + Joi.
- Lifecycle policies are required to clean up incomplete or failed uploads.
- Slower user feedback compared to frontend parsing, but more secure and auditable.
