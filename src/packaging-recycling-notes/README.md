# Packaging recycling notes

This module creates packaging recycling notes (PRNs), moves them through their statuses and serves them, with the tonnage they issue.

Code outside the module imports from three entry points, and each lists its exports by name:

- **`index.js`** is the public interface: the PRN types, the type of the PRN repository port, and the functions other modules call. It loads no route, adapter or Hapi code.
- **`plugin.js`** holds the module's production plugins: the PRN routes, the MongoDB adapter of the PRN repository, and the PRN events plugin. It also exports the MongoDB pieces of the server's startup sweep, which repairs stale PRN projections. Only code in `src/server`, `src/plugins` and `src/test` may import it.
- **`test-support.js`** holds what tests need: the in-memory repository and its plugin, the MongoDB repository and its collection name, the PRN builders and the external API token helpers. Only a test may import it. The test server registers that plugin.

[`src/modules.md`](../modules.md) describes the shape every module takes.

Lint refuses any other import into the module, but it cannot see a `vi.mock` path or a JSDoc type import.

## Shape

- **`domain/`** holds the PRN types and the rules over them.
- **`application/`** issues and moves PRNs, raises their events and works out their tonnage.
- **`repository/`** stores PRNs.
- **`routes/`** holds the HTTP endpoints.
