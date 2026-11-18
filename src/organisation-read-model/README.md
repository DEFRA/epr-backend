# Organisation read model

This is the first module built to [ADR 0027's modular monolith](https://github.com/DEFRA/epr-re-ex-service/blob/main/docs/architecture/decisions/0027-modular-monolith-structure.md). It serves organisations, their registrations and their accreditations in the shape [ADR 0052](https://github.com/DEFRA/epr-re-ex-service/blob/main/docs/architecture/decisions/0052-organisation-read-model.md) defines. A caller never learns where the data came from.

## Public interface

Code outside this folder imports from two files only. The `import-x/no-restricted-paths` rule in `eslint.config.js` refuses any other import.

- **`index.js`** exports the port, the plugin that registers it as `organisationReadRepository`, and the domain vocabulary: the `Organisation`, `Registration` and `Accreditation` types, the status constants, and the functions that read standings and timelines.
- **`test-support.js`** exports what other modules' tests need: the in-memory repository and its plugin, the test data builders, and helpers that seed the stand-in. Only tests import it.

## Inside

| Folder                           | Holds                                                                                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `domain/`                        | The read model's types and the rules over them. Its code imports nothing from the rest of the module.                                                                                                                                                  |
| `reex-store/`                    | The read of re-ex's own store: organisations, their registrations and their 2026 accreditations from `epr-organisations`.                                                                                                                              |
| `registration-service/`          | Where external accreditations come from. `port.js` defines the registration service. `reg-accred.js` calls Reg Accred.                                                                                                                                 |
| `registration-service/stand-in/` | The `external-accreditations` collection, which stands in for Reg Accred wherever Reg Accred is not called. It holds the collection's repository, the dev route that writes it, and the delete the non-prod data reset calls.                          |
| `repository/`                    | The port, its in-memory and MongoDB implementations, and their plugins. The MongoDB repository merges the two sources: it takes organisations from re-ex's store and the year's accreditations from the registration service, and owns the year rules. |

The plugin chooses the registration service from `featureFlags.regAccredExternalAccreditations` and passes it to the repository already built.

## What stays outside

The organisations repository writes `epr-organisations` and serves the `/v1` organisation routes. The read model reads the collection through its own find, and the lint rule refuses its imports of `mongodb.js` and `mongodb-find.js` from `src/repositories/organisations/`. Both finds build their search filter with `find-filter.js`, so the two search the collection the same way.
