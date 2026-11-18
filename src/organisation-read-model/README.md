# Organisation read model

This module serves organisations, their registrations and their accreditations in the shape [ADR 0052](https://github.com/DEFRA/epr-re-ex-service/blob/main/docs/architecture/decisions/0052-organisation-read-model.md) defines. A caller never learns where the data came from.

Code outside the module imports only `index.js`, or `test-support.js` in a test. Lint enforces this.

## Shape

The data comes from two sources:

- **Re-ex's own store.** This source reads the organisations, their registrations and the accreditations that re-ex holds itself.
- **The registration service.** This source supplies the accreditations held outside re-ex. It is either Reg Accred or the external accreditations collection, and the plugin chooses between them.

The repository merges the two sources and owns the rules for which year each source serves. The read model's types and the rules over them live in `domain/`, which imports nothing else from the module.

The organisations repository owns the writes to `epr-organisations`, which the read model reads.
