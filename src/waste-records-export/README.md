# Waste records export

This module streams waste records as CSV: every waste record in the system, the records of one registration, and the records of one summary log submission. It also serves the years that waste records can be exported for.

Code outside the module imports from three entry points, and each lists its exports by name:

- **`index.js`** is the public interface: the submission CSV stream and the CSV rules other modules use. It loads no route, adapter or Hapi code.
- **`plugin.js`** is the module's Hapi plugin, which adds its routes. Only the server setup and the test servers may import it, and each registers it beside the router.
- **`test-support.js`** holds what a test needs to build an expected CSV, and only a test may import it.

Lint refuses any other import into the module, but it cannot see a JSDoc `@import`.

## Shape

- **`domain/`** holds the CSV columns and the rules over them.
- **`application/`** loads the records and streams them as CSV.
- **`routes/`** holds the HTTP endpoints.
