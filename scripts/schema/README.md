# Schema generation scripts

Convert our Joi validation schemas into JSON Schema (draft-2019-09) for external consumers and tooling.

This folder contains small helpers that use `joi-to-json` to transform the Joi schemas defined under `src/repositories/**/schema.js` into JSON files under a local `.schemas/` directory.

## What it generates today

- `scripts/schema/index.js` currently generates a single file:
  - `.schemas/organisation.json` – derived from `src/repositories/organisations/schema.js` (the `organisationUpdateSchema`).

You can extend this to generate more schemas (see Extending below).

## Prerequisites

- Node.js 22 or later (the repo is ESM and uses `package.json#type` and `imports`)
- npm 9+ (or whatever ships with your Node 22 install)
- Project dependencies installed

## Install dependencies

```cmd
npm ci
```

If you don’t use a lockfile workflow, `npm install` also works.

## Generate schemas

Run from the repository root so Node’s import map (the `imports` field in `package.json`) resolves correctly:

```cmd
npm run schema:generate
```

This will create the output directory (if missing) and write JSON Schema files under:

- `.schemas/organisation.json`

## Clean and re-generate

The generator overwrites existing files. To start fresh you can remove the folder and re-run:

```cmd
rmdir /s /q .schemas
npm run schema:generate
```

(WSL/macOS/Linux equivalent: `rm -rf .schemas && npm run schema:generate`)

## Extending: add more schemas

Follow this pattern to generate additional JSON Schemas from other Joi schemas in the codebase.

1. Create a generator module next to the existing one

- Location: `scripts/schema/<your-name>.js`
- Shape: export a function that returns a JSON Schema by parsing a Joi schema with `joi-to-json`.

Example (generating a schema for a hypothetical summary logs repository):

```js
// scripts/schema/summary-logs.js
import parse from 'joi-to-json'
import { summaryLogSchema } from '#repositories/summary-logs/schema.js'

export const getSummaryLogsJSONSchema = () => {
  return parse(summaryLogSchema, 'json-draft-2019-09')
}
```

2. Wire it up in the main entry `scripts/schema/index.js`

Import your function and write it to a file under `.schemas/` (choose a sensible filename).

```js
// scripts/schema/index.js
import fs from 'fs'
import path from 'path'
import { getOrganisationJSONSchema } from './organisation.update.js'
import { getSummaryLogsJSONSchema } from './summary-logs.js' // <- your new generator

const outputDir = path.join(process.cwd(), '.schemas')
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir)
}

// Existing organisation schema
const organisation = getOrganisationJSONSchema()
fs.writeFileSync(
  path.join(outputDir, 'organisation.json'),
  JSON.stringify(organisation, null, 2)
)

// New summary-logs schema
const summaryLogs = getSummaryLogsJSONSchema()
fs.writeFileSync(
  path.join(outputDir, 'summary-logs.json'),
  JSON.stringify(summaryLogs, null, 2)
)
```

3. Re-run the generator

```cmd
npm run schema:generate
```

You should now see your new file under `.schemas/summary-logs.json`.

## Troubleshooting

- ERR_MODULE_NOT_FOUND when importing `#repositories/...`:
  - Ensure you’re running from the repository that contains `package.json` with the `imports` map.
  - Use Node 22+ as required by this repo (`engines.node ">=22"`).
- Empty or unexpected output:
  - Confirm you are parsing the correct Joi schema (e.g., update vs insert schemas differ).
  - `joi-to-json` supports draft 2019-09 here; if you need a different draft, update the second argument accordingly.
- Permissions/paths on Windows:
  - Run the script from a location where the process can create `.schemas/`.

## Where these schemas are used

These JSON Schema artifacts are intended for downstream consumers (e.g., API clients, validation tooling, documentation). They are not required at runtime by the server and can be re-generated on demand.

## Related

- joi-to-json: https://github.com/MyPureCloud/joi-to-json
