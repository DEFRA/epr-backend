# Organisations

This module holds the routes that read or write an organisation as a whole, by its database id. Organisations stay with re-ex after registrations and accreditations leave for Reg Accred, and their long-term home is Manage Account or another service outside re-ex. So these routes belong here, not in the registration and accreditation admin module.

The routes keep their paths:

- `GET /v1/organisations/{organisationId}` serves an organisation.
- `PUT /v1/organisations/{id}` replaces an organisation, with its registrations and accreditations. It predates the admin frontend and the domain rules, and should hardly be used now.
- `PUT /v1/dev/organisations/{id}` seeds an organisation through the same handler, and is registered only when dev endpoints are on.

The module takes the shape [`src/modules.md`](../modules.md) describes. It has one entry point, **`plugin.js`**, which holds the route plugin, and lint refuses an import of anything else. The organisations repository and the organisation domain types are not in the module yet.
