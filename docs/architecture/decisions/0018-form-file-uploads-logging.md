# 18. Log File Uploads from DEFRA Forms for Manual S3 Migration

Date: 2025-11-04

## Status

Accepted

## Context

DEFRA Forms has a 90-day retention policy for uploaded files (effective 1st Sept, deletion starts 30th Nov). We need to preserve these files beyond 90 days to extract business data, such as overseas sites details from Overseas Reprocessing Sites (ORS) spreadsheets.

**Challenge:** DEFRA Forms stores files in an internal S3 bucket and provides no API for programmatic access. Direct S3 bucket access is restricted because it contains files from all DEFRA Forms, not just EPR contingency forms.

**Solution Required:** Migrate EPR-related files from DEFRA Forms S3 storage to the EPR-owned `re-ex-form-file-uploads` bucket for long-term retention.

## Decision

Implement a logging mechanism that outputs file upload information in CSV format on server startup, controlled by feature flag `FEATURE_FLAG_LOG_FILE_UPLOADS_FROM_FORMS`.

**Log Format:** `formName,submissionId,fileId`

Where:

- `formName`: Form definition name from form submission metadata
- `submissionId`: MongoDB document ID for registration/accreditation submission
- `fileId`: File identifier from DEFRA Forms

The DEFRA Forms team will obtain break glass access to execute the S3 copy operation using this log output. Log output will be provided as CSV file to defra forms team.

## Future Work

Once DEFRA Forms provides an API:

1. Automate the file migration process
2. Remove break glass write access for DEFRA Forms team to the `re-ex-form-file-uploads` bucket
