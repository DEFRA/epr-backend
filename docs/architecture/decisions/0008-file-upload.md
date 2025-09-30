# 8. File upload

Date: 2025-09-30

## Status

Accepted

## Context

Our registered users will need to upload a Summary Log that is in Excel. These files come from external users, so there is a possibility that they are unsafe. We need to:

- accept the file upload
- scan for viruses before we store them
- store file in a reliable location for later validation/processing

The Core Delivery Platform (CDP) provides a managed Uploader service that does exactly this. It takes care of file acceptance, virus scanning and storage in S3. Using it means we don’t have to build our own file handling pipeline.

## Decision

We will integrate with CDP Uploader for our file uploads.

The flow works like this:

- The frontend asks CDP to start an upload, and CDP gives back an `uploadId` and URL.
- The operator uploads their Excel file and the frontend sends it to CDP.
- CDP runs an async virus scan. [See documentation](https://github.com/DEFRA/cdp-uploader/blob/main/README.md)
- CDP stores the file in our S3 bucket.
- If the file is clean, CDP calls back to the frontend.
- Errors are handled through the frontend, either through error on upload component or through an error page
- The frontend calls the backend with the `uploadId` and the URL.
- The backend retrieves the file from S3 for further processing.

### Flow Diagram

```mermaid
sequenceDiagram
    actor Operator
    participant Frontend
    participant CDP as CDP Uploader
    participant S3
    participant Backend

    Operator->>Frontend: Upload Excel file
    Frontend->>CDP: Start upload request
    CDP-->>Frontend: uploadId + URL
    Frontend->>CDP: Forward file
    CDP->>S3: Store file
    Note over CDP: Async virus scan
    alt Scan passed
        CDP-->>Frontend: Scan result (clean)
        Frontend->>Backend: Notify with uploadId + file URL
        Backend->>S3: Retrieve file
    else Scan failed
        CDP-->>Frontend: Scan result (rejected)
        Frontend-->>Operator: Show error
        Note over Frontend: Show error in upload component or error page
    end
```

## Consequences

- Security is handled for us: every file is scanned before the backend sees it.
- We avoid the cost of building and maintaining our own file upload + virus scanning stack.
- This follows the recommended CDP approach, so we stay aligned with other services.
- On the downside, running this locally means pulling in CDP Uploader (with localstack/Docker), which makes dev setup a bit heavier.
- There’s also an extra layer of indirection (uploadId/GUID), so debugging may involve looking in multiple places.
