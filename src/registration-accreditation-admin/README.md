# Registration and accreditation admin

This module holds the admin routes that change or serve a registration or accreditation by its database id, including one that has no number yet. They belong to the registration and accreditation context, which is leaving epr-backend. Deleting this module removes those routes, and the repository functions only they use, and nothing else.

The routes keep their paths:

- The registration and accreditation `status-history` routes, which make status changes.
- The overseas sites of a registration or accreditation, addressed by id.

Organisations stay in epr-backend, so the routes that read or write an organisation as a whole, `GET` and `PUT /v1/organisations/{id}` and its dev twin, are not in this module.

Code outside the module imports from two entry points, and each lists its exports by name:

- **`index.js`** holds the routes, the repository plugin and the repository's type.
- **`test-support.js`** holds the repository's adapters, and only a test may import it.

Lint refuses any other import into the module, but it cannot see a JSDoc `@import`.

[`src/modules.md`](../modules.md) describes the shape every module takes. This module's plugin has not moved to it yet.

## Shape

The routes read and write organisations through the administration port, which the context's data tooling also uses. The module holds only what no other user of that port needs:

- **`routes/`** holds the routes.
- **`repository/`** holds the checks that a registration or accreditation number is not already in use, which the routes make before they grant one.
- **`find-accreditation-by-id.js`** finds an accreditation through the administration port.
