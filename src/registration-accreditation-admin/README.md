# Registration and accreditation admin

This module holds the admin routes that change or serve a registration or accreditation by its database id, including one that has no number yet. They belong to the registration and accreditation context, which is leaving epr-backend. Deleting this module removes those routes, and the repository functions only they use, and nothing else.

The routes keep their paths:

- The registration and accreditation `status-history` routes, which make status changes.
- The overseas sites of a registration or accreditation, addressed by id.

Organisations stay in epr-backend, so the routes that read or write an organisation as a whole are in the [organisations module](../organisations/README.md), not this one.

The module takes the shape [`src/modules.md`](../modules.md) describes, and lint refuses an import of anything but its entry points:

- **`index.js`** holds the repository's type.
- **`plugin.js`** holds the route plugin and the repository's MongoDB adapter.
- **`test-support.js`** holds the repository's in-memory adapter, and only a test may import it.

Lint cannot see a JSDoc `@import`, so it lets one through.

## Shape

The routes read and write organisations through the administration port, which the context's data tooling also uses. The module holds only what no other user of that port needs:

- **`routes/`** holds the routes.
- **`repository/`** holds the checks that a registration or accreditation number is not already in use, which the routes make before they grant one.
- **`find-accreditation-by-id.js`** finds an accreditation through the administration port.
