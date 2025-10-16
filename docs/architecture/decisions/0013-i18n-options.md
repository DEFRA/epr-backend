# 13. i18n options

Date: 2025-10-06

## Status

Accepted

## Context

We needed to add bilingual support (English and Welsh) to `epr-frontend`, following GOV.UK accessibility and localisation guidance.  
Initially, GOV.UK services were reviewed, most of which use static JSON/YAML locale files managed in-repo and injected into templates. However, to meet requirements like pluralisation, variable interpolation, and inline markup, we required a slightly more capable setup.

## Options considered

### 1. Nunjucks i18n filters/plugins

- Minimal change, integrates directly in templates
- Lacks pluralisation, interpolation, or markup control
- Not widely used in GOV.UK Node apps

### 2. JSON/YAML files + simple helper

- Simple and GOV.UK-aligned
- Limited flexibility for dynamic values or complex plural rules
- Would require custom logic for Welsh plural forms

### 3. i18next

- Mature, full-featured i18n library
- Built-in pluralisation, interpolation, HTML support, and fallbacks
- Works seamlessly with Hapi via `i18next-hapi-middleware`
- Slightly more setup and dependency overhead

**Decision:** Use **i18next** with JSON locale files.  
This gives us GOV.UK-style maintainability (flat JSON files in `locales/`) with the power to handle pluralisation, variables, and HTML markup consistently.

## Implementation

- Locale files are stored under `src/locales/{en,cy}/`  
  Organised by namespace, e.g. `common.json`, `home.json`.
- i18next is configured with:
  - `i18next-fs-backend` for file loading
  - `i18next-hapi-middleware` for per-request language handling
  - `{{lng}}/{{ns}}.json` load path
- The active language is determined by the URL prefix (`/en` or `/cy`).
- `request.t` is injected into all route handlers and views.

Example usage:

`const message = request.t('home:item', { count: 3 })`

```json
// en/home.json
{
  "item_one": "{{count}} item",
  "item_other": "{{count}} items"
}

// cy/home.json
{
  "item_one": "{{count}} eitem",
  "item_other": "{{count}} eitemau"
}
```

### Markup and variables

- Inline HTML is allowed in translation strings (e.g. for bilingual notice links).
- Variables are interpolated automatically:

```json
"greeting": "Hello there, {{name}}!"
```

```js
request.t('home:greeting', { name: 'John Doe' })
```

## Language state and URL structure

There are two main approaches to handling language state used in GOV.UK URLs:

1. **Translated slugs** (e.g. `/renew-driving-licence` vs `/adnewyddu-trwydded-yrru`)
   - Natural, user-friendly URLs
   - Requires a mapping layer between pages in different languages
   - Higher maintenance overhead

2. **Language prefixing** (e.g. `/en/summary-log` or .`/summary-log` for default english and `/cy/summary-log` for welsh)
   - Simple and clear implementation
   - Consistent structure for all pages
   - Easier to manage fallbacks if a translation is missing
   - URLs are less “pretty” but fully acceptable under GOV.UK patterns

**Decision:** Use language prefixes (`/en` and `/cy`) for routing.  
We may revisit translated slugs in the future if alignment with DEFRA standards requires it.

Example bilingual notice pattern (recommended by GOV.UK):

```html
<p>
  This service is also available
  <a href="/cy{{ currentPath }}">in Welsh (Cymraeg)</a>.
</p>
```

The alternate link is generated dynamically based on the active language and current path.

## Error messages and API responses

- All user-facing strings, including validation and upload errors, are translated using i18next.
- Known error codes are mapped to translation keys.
- Unknown or generic errors are shown in English with a short bilingual preface:

  “Sorry, there was a problem / Mae’n ddrwg gennym, bu anhawster.”

## Workflow

- Locale files are committed in-repo and reviewed via PRs.
- Developers add new translation keys per feature or namespace.
- No external translation service integration at this stage.
- Future migration to a translation platform (e.g. POEditor, Lokalise) would be straightforward.

## Consequences

- Developers must update translation files when adding or changing user-facing text.
- All routes must be nested under a language prefix.
- The i18n setup now supports:
  - Welsh pluralisation
  - Variable interpolation
  - Inline HTML
  - Automatic fallback to English

## References

- GOV.UK manual: [Add support for a new language](https://docs.publishing.service.gov.uk/manual/add-support-new-language.html)
- GOV.UK bilingual pages: [Driving licence renewal (EN)](https://www.gov.uk/renew-driving-licence) / [Driving licence renewal (CY)](https://www.gov.uk/adnewyddu-trwydded-yrru)
- GOV.UK bilingual notice example: [Register to vote](https://www.gov.uk/register-to-vote)
- i18next Documentation: [https://www.i18next.com/](https://www.i18next.com/)
- MDN Intl API: [https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl)
