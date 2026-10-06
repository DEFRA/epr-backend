---
name: designing-domain-models
description: Use when defining or changing the domain types a service works with internally, the code that turns stored records into them, or deciding what a function asks for when it takes a domain value. Also use when deciding whether a thing is owned or shared, or whether a property may be absent.
---

# Designing domain models

The domain model must be free to change as the team learns more about the domain, without each change spreading through the code. Apply these rules to what you are adding or changing. They are not a licence to audit existing types, and an existing type is not a precedent.

## The layers of model

| Model                 | Holds                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| The store             | Everything the service might ever need, including fields nothing reads yet. Nothing may be missing from it. |
| The domain model      | What the service uses, in only valid states, so code can use it without checking whether it is valid.       |
| The code that uses it | Only the parts of the domain model that each piece of code needs.                                           |

## The rules

The examples use a service where a customer owns its orders and an order owns its lines.

1. **Make invalid states unrepresentable.** Be pedantic. A precise type lets code drop the checks for states that cannot happen.
   - Each state a thing can be in is its own shape, discriminated by its status, and carries exactly the fields that state has. A field that only exists in some states belongs to the shapes for those states, not an optional field on every state. Never use `null` to mean "does not apply". The state may come from history rather than the current status: an order keeps its dispatch date after it is returned.
   - A property that may or may not be set needs a reason in the domain, such as a customer who genuinely may have no phone number. Without one, the property is required, or it belongs to a state's shape.
   - A keyed collection inside a thing is an object keyed by whatever the domain says is unique within the parent, so a duplicate cannot be held. A contract's renewals are keyed by year.
   - The store's own identifier, such as a database id, is not a field of the domain object, because domain logic seldom depends on which record it is working on. The repository takes it beside the object and returns it beside the object, with anything else the store tracks, such as a version. A key the domain issues, such as an order number, is domain data and stays in the object.
   - Keys that form one value go in one object. `validFrom` and `validTo` are a period.
   - Group every key under what owns it. A name that only reads correctly because of its prefix, such as `customerName` outside a `customer`, is doing work that structure should do.

2. **Let the domain decide what is owned and what is shared.** An order owns its lines. A product is shared by every order that names it, so each order refers to it by its product code. A store that reuses one record across owners does not make the thing shared.

3. **Convert the store to the domain model in one place.** That conversion handles every way the store is looser than the domain, by mapping the record to a state the domain defines or by rejecting it. Code past that point trusts the type and carries no check for a state the type cannot hold.

4. **Leave out what nothing reads.** A stored field that no part of the service reads is not in the domain model. It stays in the store until something needs it.

5. **Keep what the model means beside the model.** A derived fact or a rule about a type is a function in the module that owns the type. Examples are the current status worked out from a history, or whether an order can still be cancelled. Other code calls that function and never works the answer out again from the fields. A change to the model's shape then changes that module and not its callers.

6. **A function takes only what it uses.** Code uses the domain model the way a page uses an API, so it asks for only the fields it needs. A function that writes a delivery note asks for an order's delivery window and lines. Callers still pass the whole order, because the order has both. A function that formats any period asks for a period, and the caller passes the order's delivery window. Each function then shows what it depends on, and it keeps working when other parts of the order change.

## How to review a design against these rules

Read each type key by key. For each key, name what reads it, what owns it, and whether it is half of a larger value. Then read the conversion from the store against rule 3. Read each function that takes a domain value against rules 5 and 6.

Report each finding in this shape:

- **Where:** the type, key or function.
- **Rule:** the rule it breaks, by its name above.
- **Change:** the concrete change, as the corrected type or signature.

A design question the rules do not settle is not a finding. Report it as an open question for the design's owner.
