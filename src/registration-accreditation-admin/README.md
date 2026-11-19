# Registration and accreditation admin

This module holds the admin routes that serve an organisation, registration or accreditation record by its database id, including one that has no number yet. They belong to the registration and accreditation context, which is leaving epr-backend. Deleting this module removes that support and nothing else.

The routes keep their paths:

- `GET` and `PUT /v1/organisations/{id}`, which the admin UI's JSON editor reads and writes.
- The registration and accreditation `status-history` routes, which make status changes.
- The overseas sites of a registration or accreditation, addressed by id.
- `PUT /v1/dev/organisations/{id}`, the non-production seeding twin of the `PUT`.

Code outside the module imports from two entry points, and each lists its exports by name:

- **`index.js`** holds the routes, the repository plugin and the repository's type.
- **`test-support.js`** holds the repository's adapters, and only a test may import it.

Lint refuses any other import into the module, but it cannot see a JSDoc `@import`.

## Shape

- **`routes/`** holds the routes.
- **`repository/`** holds the functions the routes read and write organisations with. They are copies of the organisations repository's own, over the same store, so the numbered code does not depend on them. They share the organisations repository's stored shape, its validation and its status rules, and they pass the organisations repository's contract tests for the functions they copy.
