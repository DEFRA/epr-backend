# 11. File parsing

Date: 2025-10-07

## Status

Approved

Extended by [17. Decouple spreadsheet data extraction from layout using markers](0017-decouple-spreadsheet-data-extraction-from-layout-using-markers.md)

## Context

Registered users provide Summary Log files as Excel spreadsheets via CDP Uploader (which performs virus scanning before publishing files to S3 for EPR team processing).

Each spreadsheet contains multiple worksheets with one or more data "sections":

- Received tab
  - Section 1: Add to your waste balance
  - Section 2: Prepare for your month reports
  - Section 3: Ensure you're compliant
- Processed tab
  - Section 4: Processed
- Sent on tab
  - Section 5: Sent on

The implication is that we need the ability to read specific cell ranges across multiple sheets, with some sections being critical for validation and storage.

We need to:

- Create a worker thread for parsing to avoid blocking the main thread with CPU-intensive operations on potentially large files
- Within the worker thread:
  - Retrieve the binary file from S3
  - Parse the spreadsheet contents
  - Return structured JSON for validation and storage

### Key Requirements

- Read specific cell ranges across multiple sheets
- Handle typed cell values (dates, numbers, text)
- No security vulnerabilities
- Standard npm deployment process
- Compatible licensing for government use

## Decision

Use **exceljs** for parsing Excel spreadsheet files.

### Alternatives Considered

| Library             | Pros                                                                                                                                                                                               | Cons                                                                                                                                                                                                   | Decision        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| **xlsx (SheetJS)**  | Most widely adopted with extensive community usage. Regular updates and broad feature set.                                                                                                         | Prototype pollution vulnerability (CVE-2023-30533) in npm versions through 0.19.2. Patched version requires CDN installation, complicating deployment. Active but security concerns outweigh benefits. | ❌ Rejected     |
| **read-excel-file** | Lightweight, built-in schema validation. Actively maintained with recent updates.                                                                                                                  | Cannot read specific cell ranges or perform complex sheet operations. Limited functionality for our use case.                                                                                          | ❌ Rejected     |
| **exceljs**         | Full read capabilities, specific range selection, typed values, no known vulnerabilities, standard npm installation. Actively maintained with consistent releases and responsive issue resolution. | More verbose API, includes unused write features. Larger bundle size than read-only alternatives.                                                                                                      | ✅ **Selected** |

### Licensing

All evaluated libraries use permissive licenses (MIT/Apache 2.0) that:

- Allow commercial/non-commercial use and modification
- Require only copyright attribution
- Are compatible with UK Government Licensing Framework

## Consequences

### Benefits

- Type-safe value extraction without manual parsing
- Secure, actively maintained dependency
- Standard npm installation and deployment
- Clear compliance path through copyright attribution
- Direct access to specific cell ranges and sheets

### Trade-offs

- More verbose API than simpler alternatives
- Larger dependency size due to unused write/formatting capabilities
- Team learning curve for those unfamiliar with the library

### Risks

- **Low Risk**: Potential abandonment (current activity suggests active maintenance)
- **Low Risk**: Performance impact from unused features (negligible for our use case)
