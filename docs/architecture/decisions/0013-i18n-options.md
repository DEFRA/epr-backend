# 13. i18n options

Date: 2025-10-06

## Status

Proposed

## Context

We need to add bilingual support (English and Welsh) to `epr-frontend`.
Reviewing GOV.UK guidance on multilingual services and how existing GOV.UK apps handle translations, GOV.UK generally uses locale files (JSON/YAML) managed in repos, with simple helpers for rendering. More complex setups (like i18next) are common outside GOV.UK, but are not usually applied in GOV.UK services.

## Options considered

### 1. Nunjucks i18n filters/plugins

- Minimal change, works directly in templates
- Limited features, not widely used in GOV.UK services

### 2. i18next

- Full-featured, mature i18n library
- Handles plurals and fallbacks automatically
- More setup and dependency overhead
- Overkill for English/Welsh only

### 3. JSON/YAML files + simple helper

- Same pattern GOV.UK services use
- Easy to keep in repo, review in PRs
- Works fine for English/Welsh (plural rules can be handled with separate keys if needed)
- Use native \*_Intl API_- for dates/numbers/currency formatting
- Simple to wire into Hapi + Nunjucks

**Decision**: Go with **JSON/YAML locale files + helper**, and use Intl API for formatting. i18next was considered but not required for English/Welsh only.

## Language state

We looked at GOV.UK examples like driving licence renewal.

- GOV.UK uses fully translated slugs (e.g. `/renew-driving-licence` vs `/adnewyddu-trwydded-yrru`).
- That gives natural URLs but adds complexity (mapping between routes in both languages).

For our app:

- \*_Use URL prefix_- (`/en/...`, `/cy/...`)
  - Easier to implement and reason about
  - Provides a fallback path if a page is missing in one language
  - Clear separation in routing

- We may revisit translated slugs later if required for consistency with GOV.UK publishing.

Cookies and headers were considered but will not be the main way of storing language state (can be fallback only).

## Picker

We reviewed GOV.UK practice for language pickers:

- The most common pattern is an **inline notice at the top of the page**, e.g.:

  ```html
  <div
    role="note"
    aria-label="Information"
    class="application-notice info-notice"
  >
    <p>
      This service is also available
      <a href="/cy/some-page">in Welsh (Cymraeg)</a>.
    </p>
  </div>
  ```

- This is the recommended approach for our app as it matches GOV.UK standards.

Alternative:

- A \*_header toggle link_- between `/en/...` and `/cy/...`.
- Not a GOV.UK standard, but could improve visibility if bilingual switching becomes a primary feature.

We recommend starting with the \*_inline notice pattern_- for compliance with GOV.UK practice.

## Network responses and error messages

All user-facing error messages — whether from our own services or external systems (e.g. CDP uploader) — should go through the same translation layer where possible.

- The backend determines language preference from the URL prefix (fallback to `Accept-Language` if needed).
- Known error codes or validation issues should be mapped to translation keys in locale files before being sent to the frontend.
- Frontend components and validation logic should use the same translation keys for consistency.
- For errors from third parties, we only translate known or expected cases (for example, invalid file type or file too large).
- Unknown or unclassified errors are displayed in English only to avoid incorrect translations, prefixed by a short bilingual message such as:  
  \*“Sorry, there was a problem / Mae’n ddrwg gennym, bu anhawster.”-
- Technical details and stack traces are logged in English and not shown to users.

## Workflow

- Locale files in repo under `locales/`
- Organised per feature if needed (e.g. `summary-log.en.json`, `summary-log.cy.json`)
- Managed manually through PRs
- No centralised translation system at this stage (too heavy for our scope)

## Consequences

- Developers need to add/change text via translation files
- Routing and toggle must handle URL prefix
- Straightforward to extend later if more languages are needed

## References

- GOV.UK manual: [Add support for a new language](https://docs.publishing.service.gov.uk/manual/add-support-new-language.html)
- GOV.UK bilingual pages: [Driving licence renewal (EN)](https://www.gov.uk/renew-driving-licence) / [Driving licence renewal (CY)](https://www.gov.uk/adnewyddu-trwydded-yrru)
- GOV.UK bilingual notice example: [Register to vote](https://www.gov.uk/register-to-vote)
- Intl API: [https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl)
