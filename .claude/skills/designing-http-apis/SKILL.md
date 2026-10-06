---
name: designing-http-apis
description: Use when adding, changing or reviewing an HTTP API endpoint, its request or response schema, or a design document or pull request that defines one. Also use when a client needs data the API does not yet serve, or when deciding a route's path, identifiers or version.
---

# Designing HTTP APIs

An API must stay extensible without breaking the clients that depend on it, some of which the team may not know about, and without resorting to versioning. These rules say what an endpoint should look like. Apply them to what you are adding or changing. They are not a licence to audit existing routes, and an existing route is not a precedent.

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

2. **Give every owned resource its own address under its ancestors.** An order line can be read, changed or sent a command at `/customers/{customerNumber}/orders/{orderNumber}/lines/{lineNumber}`, and a parent's representation may also embed its children. A thing the domain model treats as shared may be embedded in each owner that uses it, but it always carries its own identifier inside it, so a client can tell it is the same thing. It does so even where its owner keys it by that identifier, so it has the same shape wherever it appears. An order embeds the products it names, keyed by product code. A descendant's identity is never ambiguous. A line number is unique only within its order, so wherever an order line is named, its order and customer are named too. Usually the route does this by addressing the line through its ancestors. Otherwise the representation the line sits in names them, or they travel beside its key.

3. **Serve anything unbounded as a collection under its parent.** Events, invoices and reports grow without limit. Serve them from a collection at the parent's address, such as `/customers/{customerNumber}/invoices`, rather than embedding them in the parent's representation. Where a client reads them across owners, such as every overdue invoice, serve a top-level collection as well, which a client can filter by owner.

4. **Keep the domain model's shapes in the representation.** Be pedantic. A precise representation is cheap to change before anyone consumes it and expensive afterwards.
   - Each state is its own shape, discriminated by its status, and carries exactly the fields that state has. Never use `null` to mean "does not apply".
   - A keyed collection in the domain model is an object in the representation, keyed the same way. A collection served as its own resource under rule 3 is a list, because it is filtered and paged.
   - Keys that form one value stay in one object, and every key stays grouped under what owns it.
   - A field that is required in the store is not thereby required in the response. Decide from the domain.

5. **Make changes additive only.** Never remove, rename or reuse a field. Clients ignore fields they do not know. Enumerations are open, so clients handle a value they do not know. Anything that might grow is an object: the response body is always an object, never a bare array, and a value that could plausibly gain attributes is an object from the start, because turning a scalar into an object later breaks every client.

6. **Send writes to the smallest owned resource, or make them commands on it.** Never `PUT` a whole customer. A state change, such as cancelling an order, is a command on that order.

7. **Serve a domain field once a client needs it, and shape it by the domain, not by the screen.** A client's need decides whether a field is served. The domain decides what the field is called and what shape it takes, so a current status derived from a status history is served as the domain defines it, not as one page displays it. A field the domain does not define, such as a heading that joins two values, belongs in the page that needs it. A domain field that no client needs yet stays unserved, because adding it later is additive and the domain may be better understood by then.

8. **Address resources by their domain keys.** A top-level resource is addressed by the identifier the domain issues, such as a customer number, not by its database id. An owned resource is addressed by the key its parent keeps it under, so a contract's renewal lives at `/contracts/{contractNumber}/renewals/{year}`. A resource that has no domain key yet, such as a draft order, is given a key of its own, such as a draft number, so that clients are not tied to the database. Its database id is the last resort. An identifier people quote on its own, such as the renewal's reference on a letter, is served as a field, and a client finds the resource from it through a query on a collection. Do not put a version in the path, including on a new route built beside a versioned one. Design so that no version is needed. If one ever is, the API documents the media types it supports, and the client asks for one in the `Accept` header at the same address. `application/json` stays the original representation, so existing clients are unaffected.

9. **Build new routes beside the existing ones, and retire the old ones later.** Never narrow or reshape a live route in place. Clients the team does not know about may read a route, so a search of the known clients does not prove it unused.

10. **Declare every response.** Each endpoint declares its response schema, and it returns what the schema declares and nothing else. Nothing reaches a client by passing the stored document through. The schema states each date as an ISO 8601 date or date-time, and each list's order. Where the store is looser than the schema, such as a reference to a record that no longer exists, the design says what the endpoint does.

## How to review a design against these rules

Read the schema key by key. For each key, name the client need that serves it, what owns it, whether it is half of a larger value, and which model it comes from. Then read each path and each write against the rules above.

Report each finding in this shape:

- **Where:** the path, schema or key.
- **Rule:** the rule it breaks, by its name above.
- **Change:** the concrete change, as the corrected path or schema fragment.

A statement in the design that contradicts the code or another design decision is always a finding. A design question the rules do not settle is not a finding. Report it as an open question for the design's owner.
