---
name: designing-http-apis
description: Use when adding, changing or reviewing an HTTP API endpoint, its request, response, error or paging shape, or a design document or pull request that defines one. Also use when a client needs data the API does not yet serve, or when deciding a route's path, identifiers or version.
---

# Designing HTTP APIs

An API must stay extensible without breaking the clients that depend on it, some of which the team may not know about, and without resorting to versioning. These rules say what an endpoint should look like. Apply them to what you are adding or changing. They are not a licence to audit existing routes, and an existing route is not a precedent.

**Every new API follows [JSON:API 1.1](https://jsonapi.org/format/1.1/)** and returns full JSON:API documents. The rules below say how our domain maps onto JSON:API. Where JSON:API leaves a choice open, they make it.

**REQUIRED BACKGROUND:** the API is built on the domain model that `designing-domain-models` defines. Design or check that model first, then adapt it to the API with the rules below.

## The layers of model

| Model                  | Holds                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| The store              | Everything the service might ever need. The API never reads it directly.                                                                  |
| The domain model       | What the service uses, in only valid states. The API starts from it.                                                                      |
| The API representation | A close fit to the domain model, not to any one client. It may add ways to fetch related resources together, but it stays that close fit. |
| Each client's view     | Only the fields that client uses, for the purpose it uses them.                                                                           |

A response that mirrors the stored document couples every client to storage. A response that mirrors one page couples every other client to that page.

## The rules

The examples use a service where a customer owns its orders and an order owns its lines.

1. **Model resources, not pages or actors.** Describe a resource as the domain holds it, independent of any screen. Three tells show a page-shaped response. A parent's field is folded into a child to fill a heading. A response leaves out things the domain holds because one page doesn't show them, rather than letting the client filter in its query. A field the domain does not define is added because a design shows it. An actor in the path, such as `/admin/`, is the same defect. An admin path is only for operating the service itself, such as purging a dead-letter queue, never for reading or changing the domain.

2. **Give every owned resource its own address under its ancestors, and link to it.** An order line can be read, changed or sent a command at `/customers/{customerNumber}/orders/{orderNumber}/lines/{lineNumber}`. Clients follow links rather than build addresses, so the address can change without breaking them.
   - Every resource object has a `links.self` holding its address.
   - Its `type` is the plural collection name, such as `lines`. Its `id` joins its ancestors' keys and its own with `/`, in path order, such as `C1001/O2002/3`.
   - Its owner, and each collection it owns, is a relationship with `links.related`. A line has an `order` relationship, and an order has a `lines` relationship.
   - A thing the domain model treats as shared is a relationship too, holding its resource identifier, so a client can tell it is the same thing wherever it appears. An order's products are a `products` relationship.
   - A client that wants related resources in the same response asks with `include`, and they arrive in `included`. A parent never folds its children into its attributes.

3. **Serve anything unbounded as a collection under its parent.** Events, invoices and reports grow without limit. Serve them from a collection at the parent's address, such as `/customers/{customerNumber}/invoices`, rather than as a relationship holding every identifier. Where a client reads them across owners, such as every overdue invoice, serve a top-level collection as well, which a client can filter by owner. A collection takes these query parameters:
   - `filter[<field>]` for each filter, where `<field>` is the dotted path of the attribute it applies to. Filters combine with AND. A comma-separated value matches any of its values.
   - `sort`, a comma-separated list of fields, with a `-` prefix for descending. The server adds a unique tie-break after them, so the same query always gives the same pages.
   - `page[number]` and `page[size]` for a client that shows pages to people. The response gives `links.first`, `prev`, `next` and `last`, and the totals in `meta.page`.
   - `page[size]` and `page[after]` for a system that walks every matching record, following the [cursor pagination profile](https://jsonapi.org/profiles/ethanresnick/cursor-pagination/). The response gives `links.next`, which is `null` at the end.
   - One collection address serves both kinds of paging. A `page[size]` above the maximum returns a `400`.

4. **Keep the domain model's shapes in the representation.** Be pedantic. A precise representation is cheap to change before anyone consumes it and expensive afterwards.
   - Each state is its own shape, discriminated by its status, and carries exactly the attributes that state has. Never use `null` to mean "does not apply".
   - A key that names another resource is a relationship, not an attribute.
   - A keyed collection of values in the domain model is an object in the attributes, keyed the same way. A keyed collection of owned resources is a relationship under rule 2.
   - Keys that form one value stay in one object, and every key stays grouped under what owns it.
   - An attribute that is required in the store is not thereby required in the response. Decide from the domain.

5. **Make changes additive only.** Never remove, rename or reuse an attribute or relationship. Clients ignore members they do not know. Enumerations are open, so clients handle a value they do not know. A value that could plausibly gain attributes is an object from the start, because turning a scalar into an object later breaks every client.

6. **Send writes to the smallest owned resource, or make them commands on it.** A `PATCH` names only the attributes and relationships it changes. Never replace a whole customer. A state change, such as cancelling an order, is a command on that order: a `POST` that creates a resource in a collection under it, such as `/customers/{customerNumber}/orders/{orderNumber}/cancellations`.

7. **Serve a domain field once a client needs it, and shape it by the domain, not by the screen.** A client's need decides whether a field is served. The domain decides what the field is called and what shape it takes, so a current status derived from a status history is served as the domain defines it, not as one page displays it. A field the domain does not define, such as a heading that joins two values, belongs in the page that needs it. A domain field that no client needs yet stays unserved, because adding it later is additive and the domain may be better understood by then.

8. **Address resources by their domain keys.** A top-level resource is addressed by the identifier the domain issues, such as a customer number, not by its database id. An owned resource is addressed by the key its parent keeps it under, so a contract's renewal lives at `/contracts/{contractNumber}/renewals/{year}`. A resource that has no domain key yet, such as a draft order, is given a key of its own, such as a draft number, so that clients are not tied to the database. Its database id is the last resort. An identifier people quote on its own, such as the renewal's reference on a letter, is served as an attribute, and a client finds the resource from it with a filter on a collection. Design so that no version is needed, and give a new route no version in its path, even beside a versioned one. If a breaking version is ever unavoidable, it goes in the path, beside the old one.

9. **Build new routes beside the existing ones, and retire the old ones later.** Never narrow or reshape a live route in place. That includes moving a route to JSON:API. Clients the team does not know about may read a route, so a search of the known clients does not prove it unused.

10. **Declare every response, including its errors.** Each endpoint declares its response schema, and it returns what the schema declares and nothing else. Nothing reaches a client by passing the stored document through. The schema states each date as an ISO 8601 date or date-time, and each collection's default order. Where the store is looser than the schema, such as a reference to a record that no longer exists, the design says what the endpoint does. An error response is a JSON:API `errors` array. Each error object carries its `status`, a `code` that stays the same for every occurrence of that kind of error, a `title`, and a `source` naming the parameter or body member at fault where there is one.

## How to review a design against these rules

Read the schema member by member. For each attribute and relationship, name the client need that serves it, what owns it, whether it is half of a larger value, and which model it comes from. Then read each path, each link and each write against the rules above.

Report each finding in this shape:

- **Where:** the path, schema or member.
- **Rule:** the rule it breaks, by its name above.
- **Change:** the concrete change, as the corrected path or schema fragment.

A statement in the design that contradicts the code or another design decision is always a finding. A design question the rules do not settle is not a finding. Report it as an open question for the design's owner.
