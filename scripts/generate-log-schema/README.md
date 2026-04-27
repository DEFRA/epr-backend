# Log schema generator

Test-time validator for log shapes emitted by `epr-backend`. Catches drift before unindexed fields silently land in CDP's dropped-fields S3 sink.

## What's here

- `parse.js` — parsers for upstream CDP files (tf `include_keys`, OpenSearch index template properties)
- `parse-upstream.js` — reads upstream files, emits `parsed-sources.json` (sibling to `log-schema.js`) and `sources.lock.json`
- `check-upstream.js` — recomputes upstream hashes, compares to `sources.lock.json`; non-zero exit on drift
- `sources.lock.json` — git refs and sha256 hashes of upstream files at last regen

The runtime artifact (`src/common/helpers/logging/log-schema.js`) imports `parsed-sources.json` and builds a Joi schema at import time. Test code uses `expectLogToBeCdpCompliant(logObject)` from `log-schema.test-helper.js`.

## Sources of truth

- `cdp-tf-modules/opensearch_ingestion/vars.tf` `include_keys` — authoritative for _which_ fields the ingestion pipeline accepts
- `cdp-tf-core/files/cdp-logs-index-template.json` — authoritative for _types_ of those fields

Both repos must be checked out as siblings of this one (`../../cdp-tf-modules/`, `../../cdp-tf-core/`) for regen and drift checks to work.

## Workflows

### Regenerate the schema

After pulling new commits in `cdp-tf-modules` or `cdp-tf-core`:

```sh
npm run log-schema:regen
```

This rewrites `src/common/helpers/logging/parsed-sources.json` and `scripts/generate-log-schema/sources.lock.json`. Commit both files together.

### Check for upstream drift

```sh
npm run log-schema:check
```

Reads the current upstream files, hashes them, compares to `sources.lock.json`. Exits non-zero with an actionable message if they've changed since the last regen. Run locally; not wired into CI (CI doesn't have sibling repos).

## Type mapping

OpenSearch type → Joi schema:

| OS type   | Joi                       |
| --------- | ------------------------- |
| `keyword` | `Joi.string()`            |
| `text`    | `Joi.string()`            |
| `ip`      | `Joi.string()`            |
| `long`    | `Joi.number().integer()`  |
| `date`    | `Joi.string().isoDate()`  |
| `boolean` | `Joi.boolean()`           |
| `float`   | `Joi.number()`            |
| `double`  | `Joi.number()`            |
| (unknown) | `Joi.string()` (fallback) |

## What's NOT here

- Runtime validation — schema is test-time only, zero prod cost
- Auto-sync from `cdp-tf-modules` — manual regen by design
- ESLint rule for log call shapes — separate concern, not pursued
- CI scheduled drift check — could be added later via a GitHub Action
