# Guide to Template Markers for Excel Spreadsheets

## What Markers Are

Markers are hidden text codes in your spreadsheet that tell our system where to find data. Each marker starts with `__EPR_` and appears in a cell, with the data to extract positioned relative to that marker. The system scans all worksheets for these markers and extracts the associated data automatically.

## Why We Use Markers

Without markers, our system would need to know the exact cell position of every piece of data (e.g., "PROCESSING_TYPE is always in cell B1"). Any change to the template layout would break the system. With markers, you can move sections around, add rows, rearrange worksheets, or insert columns without breaking data extraction. The markers identify what the data represents; their position in the spreadsheet doesn't matter.

Markers make the spreadsheet self-describing. You can add new metadata fields or new data sections without developer support. The system extracts whatever markers it finds. The extraction succeeds regardless of what markers you add—unrecognized fields are simply ignored until developers add code to use them. This lets templates evolve without waiting for code changes.

## How Markers Work

The system finds markers by scanning all cells in all worksheets. The `__EPR_` prefix makes markers unmistakable and prevents confusion with user data. Worksheet names are ignored—markers provide all the context needed. The system extracts whatever markers it finds, allowing templates to evolve without requiring code changes.

## Adding Metadata Markers

Metadata markers identify single values like processing type, template version, or accreditation number. A metadata marker starts with `__EPR_META_` followed by the field name in capital letters with underscores between words.

Put the marker in a cell - the contents of the cell immediately to the right is the value that will be extracted.

**Example:**

| Column A                      | Column B        |
| ----------------------------- | --------------- |
| `__EPR_META_PROCESSING_TYPE`  | REPROCESSOR     |
| `__EPR_META_TEMPLATE_VERSION` | 1               |
| `__EPR_META_MATERIAL`         | Paper and board |

The system extracts "REPROCESSOR" as PROCESSING_TYPE, "1" as TEMPLATE_VERSION, and "Paper and board" as MATERIAL.

## Adding Data Section Markers

Data section markers identify tables of data. A data section marker starts with `__EPR_DATA_` followed by the table name in capital letters with underscores between words.

Put the marker in a cell - machine-readable column headers must be in the cells to the right on the same row. The system reads headers until it encounters an empty cell—headers stop at the first empty cell. Put data rows below the headers. A row where all data cells are empty or null signals the end of the table. If the table continues to the last row of data, the system reads all rows without requiring an empty terminator.

**Example:**

| Column A                          | Column B      | Column C      |
| --------------------------------- | ------------- | ------------- |
| `__EPR_DATA_UPDATE_WASTE_BALANCE` | OUR_REFERENCE | DATE_RECEIVED |
|                                   | 12345678910   | 2025-05-25    |
|                                   | 98765432100   | 2025-05-26    |
|                                   |               |               |

The system extracts a table called UPDATE_WASTE_BALANCE with two columns (OUR_REFERENCE and DATE_RECEIVED) and two data rows. The empty row signals the end of the table.

## Placing Tables Side-by-Side

Tables can be stacked vertically or placed side-by-side. When placing tables side-by-side, you must put an empty cell between them—this stops the first table's headers from reading into the second table's marker.

**Example (side-by-side tables):**

| Column A                          | Column B      | Column C      | Column D | Column E                     | Column F      | Column G       |
| --------------------------------- | ------------- | ------------- | -------- | ---------------------------- | ------------- | -------------- |
| `__EPR_DATA_UPDATE_WASTE_BALANCE` | OUR_REFERENCE | DATE_RECEIVED |          | `__EPR_DATA_MONTHLY_REPORTS` | SUPPLIER_NAME | ADDRESS_LINE_1 |
|                                   | 12345678910   | 2025-05-25    |          |                              | Joe Blogs     | 15 Good Street |
|                                   |               |               |          |                              |               |                |

This creates two separate tables: UPDATE_WASTE_BALANCE (columns B-C) and MONTHLY_REPORTS (columns F-G). The empty cell in column D stops the first table's headers from continuing into column E.

## Using Skip Column Markers

Sometimes you want to visually separate groups of columns within one logical table. Use `__EPR_SKIP_COLUMN` in the header row to mark columns that should be skipped.

Put `__EPR_SKIP_COLUMN` in a header position where you want a blank column. The system includes this position in the extracted data as `null`, maintaining column alignment for error reporting.

**Example:**

| Column A                    | Column B      | Column C      | Column D            | Column E     | Column F      |
| --------------------------- | ------------- | ------------- | ------------------- | ------------ | ------------- |
| `__EPR_DATA_WASTE_RECEIVED` | OUR_REFERENCE | DATE_RECEIVED | `__EPR_SKIP_COLUMN` | SUPPLIER_REF | SUPPLIER_NAME |
|                             | 12345678910   | 2025-05-25    |                     | ABC123       | Joe Blogs     |

This extracts as a single table with five columns. Column D becomes `null` in the extracted data, but the visual gap in Excel makes the spreadsheet easier to read.

## Skipping Example Rows

Templates often include a frozen example row to help users understand what data to enter. The system automatically skips rows where a `__EPR_SKIP_COLUMN` column contains the text "Example".

Put `__EPR_SKIP_COLUMN` in a header position, then put "Example" in that column for the example row. The system will skip that row during data extraction.

**Example:**

| Column A             | Column B | Column C            | Column D            | Column E |
| -------------------- | -------- | ------------------- | ------------------- | -------- |
| `__EPR_DATA_SENT_ON` | ROW_ID   | `__EPR_SKIP_COLUMN` | DATE_LOAD_LEFT_SITE | WEIGHT   |
|                      | row-1    | Example             | 2024-01-15          | 100      |
|                      | row-2    |                     | 2024-01-16          | 200      |
|                      | row-3    |                     | 2024-01-17          | 300      |

In this example, the first data row (row-1) is skipped because its skip column contains "Example". The extracted table contains only row-2 and row-3.

**Important:** The skip text must be exactly "Example" (case-sensitive). Text like "example", "EXAMPLE", or "Example row" will not trigger row skipping.

## Marker Placement

Markers can appear in any column. The system scans all cells in all worksheets to find markers.

## Hiding Markers

Markers must remain in the spreadsheet but should be hidden from users. Use one of these methods:

- Hide the column containing markers (right-click column header, select "Hide")
- Hide the row containing markers (right-click row number, select "Hide")
- Set marker cell font colour and fill colour to be the same
  Ensure that any cells containing markers are locked and protected.

The first method (hiding columns) is most reliable and easiest to maintain.

## Marker Naming Rules

Marker names must follow these rules:

- Start with `__EPR_META_` for metadata or `__EPR_DATA_` for tables
- Use only capital letters, numbers, and underscores after the prefix
- Use underscores to separate words (e.g., `DATE_RECEIVED`, not `DATERECEIVED`)
- Choose names that describe the data, not the layout

**Good names:** `__EPR_META_ACCREDITATION_NUMBER`, `__EPR_DATA_UPDATE_WASTE_BALANCE`

**Bad names:** `__EPR_META_TopSection`, `__EPR_DATA_TableOne`

## Important Rules

**Empty rows signal the end of a data section.** A row where all data cells (within the column range of the table) are empty or null terminates the table. A row with at least one non-null value is still a data row. If your table has intentional blank rows, they will terminate the table early.

**Headers must be in the same row as the data marker.** The system reads headers to the right of the marker on the same row, then reads data in the rows below.

**Headers stop at the first empty cell.** When reading headers, the system stops at the first empty cell. Any headers after an empty cell are ignored.

**Metadata values must be to the right of the marker.** The system reads the cell immediately to the right, not above or below.

**Each marker name must be unique.** Duplicate metadata marker names (e.g., two `__EPR_META_PROCESSING_TYPE` markers) or duplicate data section names (e.g., two `__EPR_DATA_UPDATE_WASTE_BALANCE` markers) will cause an error. Each marker must have a unique name across the entire spreadsheet.

**One marker per data section.** Don't put multiple `__EPR_DATA_` markers in the same table. Each marker starts a new table.

**Null values are preserved in data rows.** If a cell in a data row is empty or null, the system preserves that null value in the extracted data. This maintains column alignment for error reporting.

**Don't delete markers.** If a marker is missing, the system cannot extract that data. Protect marker cells or hide them in ways that prevent accidental deletion.

## Example Template Layout

This example shows a complete template with metadata, multiple tables, skip columns, and an example row:

| Column A                          | Column B        | Column C       | Column D            | Column E  | Column F |
| --------------------------------- | --------------- | -------------- | ------------------- | --------- | -------- |
| `__EPR_META_PROCESSING_TYPE`      | REPROCESSOR     |                |                     |           |          |
| `__EPR_META_TEMPLATE_VERSION`     | 1               |                |                     |           |          |
| `__EPR_META_MATERIAL`             | Paper and board |                |                     |           |          |
|                                   |                 |                |                     |           |          |
| `__EPR_DATA_UPDATE_WASTE_BALANCE` | OUR_REFERENCE   | DATE_RECEIVED  | `__EPR_SKIP_COLUMN` | WEIGHT_KG | ORIGIN   |
|                                   | 00000000001     | 2025-01-01     | Example             | 1000      | UK       |
|                                   | 12345678910     | 2025-05-25     |                     | 1500      | UK       |
|                                   | 98765432100     | 2025-05-26     |                     | 2300      | EU       |
|                                   |                 |                |                     |           |          |
| `__EPR_DATA_MONTHLY_REPORTS`      | SUPPLIER_NAME   | ADDRESS_LINE_1 |                     |           |          |
|                                   | Joe Blogs       | 15 Good Street |                     |           |          |

In this example:

- Column A is hidden from users
- Three metadata fields are defined at the top
- UPDATE_WASTE_BALANCE table has five columns with a visual gap at column D
- The first data row (with "Example" in column D) is a frozen example row that gets skipped during extraction
- MONTHLY_REPORTS table appears below with two columns
- Empty rows separate each section

## Checking Your Work

After adding markers, verify:

1. Each marker starts with `__EPR_META_` or `__EPR_DATA_`
2. Each marker name is unique (no duplicates across the entire spreadsheet)
3. Metadata values are in the cell to the right of the marker
4. Table headers are to the right of the marker on the same row
5. Table headers have no empty cells between them (headers stop at first empty cell)
6. Table data rows are below the headers
7. Each table ends with an empty row, or continues to the last row of data
8. Markers are hidden from users
9. Marker cells are protected from accidental deletion

## Getting Help

If data isn't being extracted correctly, check:

- Is the marker spelled correctly and starts with `__EPR_`?
- Are all marker names unique (no duplicates)?
- For metadata: Is the value in the cell to the right?
- For metadata: Is another marker in the value position (this will cause an error)?
- For tables: Are headers on the same row?
- For tables: Do headers have an empty cell between them (this stops header reading)?
- For tables: Is there data in the rows below?
- For tables: Does a partially empty row terminate the table too early?
- Was the marker accidentally deleted or moved?

Contact the development team if you cannot resolve extraction issues.
