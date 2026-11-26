# Overseas sites

This module stores the overseas reprocessing sites that exporters send waste to, and imports them from ORS spreadsheets. Its routes serve the admin UI, apart from the callback the CDP uploader makes when an ORS spreadsheet has uploaded.

Code outside the module imports from three entry points, and each lists its exports by name:

- **`index.js`** is the public interface: the types of the overseas sites and ORS imports repository ports, the ORS import statuses and commands, and the rules other modules call. It loads no route, adapter or Hapi code.
- **`plugin.js`** holds the module's production plugins: the overseas sites routes and the MongoDB adapters of both repositories. It also exports what the queue consumer runs to process an ORS import. Only code in `src/server`, `src/plugins` and `src/test` may import it.
- **`test-support.js`** holds what tests need: the in-memory repositories and their plugins, the MongoDB overseas sites repository and the overseas site builder. Only a test may import it. The test server registers those plugins.

[`src/modules.md`](../modules.md) describes the shape every module takes.

Lint refuses any other import into the module, but it cannot see a `vi.mock` path or a JSDoc type import.

## Shape

- **`domain/`** holds the ORS import statuses and the approval rule.
- **`application/`** processes an ORS import and resolves a registration's overseas sites.
- **`parsers/`** reads an ORS spreadsheet.
- **`repository/`** stores overseas sites, and **`imports/`** stores ORS imports and holds the type of the worker that runs them.
- **`routes/`** holds the HTTP endpoints.
