# Waste records export

This module streams waste records as CSV: every waste record in the system, the records of one registration, and the records of one summary log submission. It also serves the years that waste records can be exported for.

Code outside the module imports from two entry points, and each lists its exports by name:

- **`index.js`** holds the routes and the CSV helpers other modules use.
- **`test-support.js`** holds what a test needs to build an expected CSV, and only a test may import it.

Lint refuses any other import into the module, but it cannot see a JSDoc `@import`.

## Shape

- **`domain/`** holds the CSV columns and the rules over them.
- **`application/`** loads the records and streams them as CSV.
- **`routes/`** holds the HTTP endpoints.
