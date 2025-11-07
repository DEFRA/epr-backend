# 19. Translation process for English/Welsh strings

Date: 2025-11-06

## Context

### Current Setup

The application uses JSON locale files (`en.json` and `cy.json`) to store translated strings across different namespaces (typically corresponding to feature folders under `src/server/**`).

Currently, the translation process is manual. To move toward a structured and partially automated workflow, we need to define how untranslated or updated strings are sent to translators and how completed translations are brought back into the codebase.

We also need to ensure consistency between English and Welsh locale files by validating that both exist and contain matching keys.

### Existing Translation Checks

Two scripts are already in place to validate translation completeness:

1. **Locale File Existence Check**
   - Verifies that if an `en.json` file exists in a folder, a corresponding `cy.json` must also exist.
   - Produces a list of missing locale files (i.e., folders where one of the language files is missing).

2. **Key Consistency Check**
   - Compares keys between `en.json` and `cy.json`.
   - Lists missing keys in either file and identifies discrepancies.

These checks ensure both languages have parallel structures and help identify untranslated or missing strings.

### Translation Format and Delivery

The translation team currently accepts **Excel** files as standard, with the possibility of also accepting **JSON** files.  
Data can be sent via email or uploaded to a platform (to be confirmed).

---

## Decision

### Chosen Approach

We will adopt a flexible export/import process that supports both Excel and JSON formats, defaulting to Excel unless a translation platform can accept JSON uploads.

This approach allows us to align with the translation team’s workflow while preparing for future automation if a platform is introduced.

### Excel Structure

Each exported Excel file will include four columns:

| Namespace               | Key             | en                         | cy                       |
| ----------------------- | --------------- | -------------------------- | ------------------------ |
| Folder name (namespace) | Translation key | English string (if exists) | Welsh string (if exists) |

This format provides the translators with clear context for each string while retaining the mapping required to import translations back into JSON files.

---

## Consequences

### Export Process

A script will generate an export file (Excel by default, JSON if required) containing all untranslated or updated strings.

The export script will:

- Identify missing or updated strings using the existing comparison scripts.
- Compile them into a structured dataset.
- Write the dataset into an Excel file (e.g. `translations-export.xlsx`).

### Translation Process

The translation team will complete the Welsh or English (`cy` | `en`) column and return the file via email or upload.  
If JSON format is supported, they may instead provide updated `cy.json` files directly depending on their setup.

### Import Process

A complementary import script will read the completed Excel file and update the relevant `cy.json` files based on the **Namespace** and **Key** columns.

- Existing keys will be updated with the new translations.
- New keys will be added where missing.

This ensures consistent re-integration of translated content with minimal manual work.

### Implementation Plan

1. Enhance existing scripts to output a structured dataset of missing or updated strings.
2. Create an **export script** using a library such as `xlsx` or `exceljs`.
3. Create an **import script** to merge completed translations back into `cy.json`.
4. Document usage and integration steps.
5. Confirm with the translation team whether a platform is used for submission to explore direct integration options.

### Future Considerations

- If the translation team adopts or confirms the use of a translation management platform (e.g. Smartling, Crowdin, lokalise), explore API-based integration to replace the Excel workflow.
- Add automation process (e.g. GitHub Actions, or manual trigger) to run translation checks and export updated strings.
- Consider versioning and change tracking for translation updates.

### Summary Table

| Aspect           | Decision                                           |
| ---------------- | -------------------------------------------------- |
| Export format    | Excel (default), JSON (optional)                   |
| Columns          | Namespace, Key, en, cy                             |
| Delivery method  | Email or upload                                    |
| Automation scope | Semi-automated (scripts for export/import)         |
| Future goal      | Integration with a translation management platform |

---
