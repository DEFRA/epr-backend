# Organisation read model

This module serves organisations, their registrations and their accreditations in the shape [ADR 0052](https://github.com/DEFRA/epr-re-ex-service/blob/main/docs/architecture/decisions/0052-organisation-read-model.md) defines. A caller never learns where the data came from.

Code outside the module imports from `index.js`, from `domain/` for the read model's types and pure rules, or from `test-support.js` in a test. Lint refuses any other import, but it cannot see a JSDoc `@import`.

## Shape

- **`domain/`** holds the read model's types and the rules over them. Its production code imports nothing else from the module.
- **`repository/`** reads re-ex's own store and the accreditations held outside re-ex, from Reg Accred or the external accreditations collection, and merges them into the read model.
