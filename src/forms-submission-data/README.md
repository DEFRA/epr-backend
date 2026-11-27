# Forms submission data

This module holds the organisation, registration and accreditation submissions made through the Defra forms, and migrates them into organisations. It serves a submission by id, and a dev endpoint migrates one submission on demand.

Code outside the module imports from three entry points, and each lists its exports by name:

- **`index.js`** is the public interface: the types of the form submissions and file uploads ports, the rules that read a submission's answers and keys, and the factories that build a submission document. It loads no route, adapter or Hapi code.
- **`plugin.js`** holds the module's production plugins: the MongoDB adapter for the form submissions port, the S3 adapter for the file uploads port, the plugin that adds the module's routes, and the plugin that adds the apply routes. It also holds the module's other server-side wiring: the function that creates the form collections, and the forms data migrator, which the migration runner runs. Only code in `src/server`, `src/plugins` and `src/test` may import it.
- **`test-support.js`** holds the in-memory adapters for both ports and their plugins, and only a test may import it. The test server registers both plugins.

[`src/modules.md`](../modules.md) describes the shape every module takes.

Lint refuses any other import into the module, but it cannot see a JSDoc `@import`.

## Shape

- **`repository/`** is the form submissions port and its MongoDB and in-memory adapters. The MongoDB adapter is not made with `portAdapter`, as `src/modules.md` asks, because it waits for the organisations plugin by its current name rather than for the port it reads.
- **`file-uploads/`** is the file uploads port and its S3 and in-memory adapters. The S3 adapter fetches the files operators uploaded with their forms from the Forms Submission API, and stores them in S3.
- **`organisation/`**, **`registration/`** and **`accreditation/`** turn each kind of submission into an organisation's parts, using the parsers in **`parsing-common/`**. The fixes in **`overrides/`** correct data quality problems in particular submissions, as configured.
- **`migration/`** works out which submissions are new and writes them into organisations.
- **`routes/`** holds the HTTP endpoints.
- **`apply/`** holds the `/v1/apply` routes that receive the forms' submissions, the collections they write to, and the form field and Notify template constants they use. The legacy apply-routes test server serves them and takes no module route plugins, so their plugin is one that every server registers.
- **`auditing/`** records the migration's changes in the audit log.
- **`submission-keys.js`** holds the keys that match an accreditation to its registration, which `index.js` exports. **`link-form-submissions.js`** links registrations and accreditations to their organisations and to each other, **`data-migration-config.js`** reads the configured overrides, and **`types.js`** holds the migration's types.
