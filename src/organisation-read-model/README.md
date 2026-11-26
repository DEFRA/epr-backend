# Organisation read model

This module serves organisations, their registrations and their accreditations in the shape [ADR 0052](https://github.com/DEFRA/epr-re-ex-service/blob/main/docs/architecture/decisions/0052-organisation-read-model.md) defines. A caller never learns where the data came from.

Code outside the module imports from three entry points, and each lists its exports by name:

- **`index.js`** is the public interface: the read model's types, its pure rules and what a caller needs to know about the stores it reads. It loads no route, adapter or Hapi code.
- **`plugin.js`** holds the MongoDB adapters' plugins, which provide the read repository and the external accreditations repository, and the plugin for the dev routes. Only code in `src/server`, `src/plugins` and `src/test` may import it.
- **`test-support.js`** holds the in-memory repository, its plugin and the test builders, and only a test may import it. The test server registers that plugin.

[`src/modules.md`](../modules.md) describes the shape every module takes.

Lint refuses any other import into the module, but it cannot see a JSDoc `@import`.

## Shape

- **`domain/`** holds the read model's types and the rules over them. Its production code imports nothing else from the module.
- **`repository/`** reads re-ex's own store and the accreditations held outside re-ex, from Reg Accred or the external accreditations collection, and merges them into the read model.
- **`external-accreditations/`** stores accreditations in the external accreditations collection, which stands in for Reg Accred where it is not called.
- **`routes/`** holds the dev route that stores an external accreditation.
