# Forms submission data

This module holds the organisation, registration and accreditation submissions made through the Defra forms, and migrates them into organisations. It serves a submission by id, and a dev endpoint migrates one submission on demand.

Code outside the module imports from three entry points, and each lists its exports by name:

- **`index.js`** is the public interface: the type of the form submissions port, the rules that read a submission's answers and keys, and the factories that build a submission document. It loads no route, adapter or Hapi code.
- **`plugin.js`** holds the module's production plugins: the MongoDB adapter for the form submissions port and the plugin that adds the module's routes. It also holds what the server setup uses at start-up, which is creating the form collections and building the forms data migration, and the apply routes, which the router still adds. Only code in `src/server`, `src/plugins` and `src/test` may import it.
- **`test-support.js`** holds the in-memory form submissions plugin and the test builders, and only a test or a test data file may import it. The test server registers that plugin.

[`src/modules.md`](../modules.md) describes the shape every module takes.

Lint refuses any other import into the module, but it cannot see a JSDoc `@import`.

## Shape

- **`repository/`** is the form submissions port and its MongoDB and in-memory adapters.
- **`file-uploads/`** fetches the files operators uploaded with their forms from the Forms Submission API, and stores them in S3.
- **`organisation/`**, **`registration/`** and **`accreditation/`** turn each kind of submission into an organisation's parts, using the parsers in **`parsing-common/`**. The fixes in **`overrides/`** correct data quality problems in particular submissions, as configured.
- **`migration/`** works out which submissions are new and writes them into organisations.
- **`routes/`** holds the HTTP endpoints.
- **`apply/`** holds the `/v1/apply` routes that receive the forms' submissions, and the collections they write to. The legacy apply-routes test server serves them, and it takes no modules, so the router adds these routes rather than the module's route plugin.
- **`auditing/`** records the migration's changes in the audit log.
