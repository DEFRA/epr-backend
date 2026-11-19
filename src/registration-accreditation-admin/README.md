# Registration and accreditation admin

This module holds the admin routes that serve a registration or accreditation by its database id, including one that has no number yet. They belong to the registration and accreditation context, which is leaving epr-backend. Deleting this module removes that support and nothing else.

The routes keep their paths:

- `GET` and `PUT /v1/organisations/{id}`, which the admin UI's JSON editor reads and writes.
- The registration and accreditation `status-history` routes, which make status changes.
- The overseas sites of a registration or accreditation, addressed by id.
- `PUT /v1/dev/organisations/{id}`, the non-production seeding twin of the `PUT`.

Code outside the module imports only `index.js`. Lint refuses any other import into the module.
