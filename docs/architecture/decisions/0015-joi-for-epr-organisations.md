# 15. Use Joi + MongoDB Native Driver for epr-organisations Schema

Date: 2025-01-21

## Status

Accepted

## Context

The EPR organisations collection has a deeply nested document structure with multiple levels (organisation → registrations[] → accreditations[]).

It needs to support CRUD operations at any level of this hierarchy.

We evaluated three approaches for schema validation:

1. **MongoDB Native $jsonSchema** - Database-level validation(currently used for form submissions)
2. **Joi** - Application-level validation (currently used for summary logs)
3. **Mongoose ODM** - Application-level with schema management

## Decision

Use Joi for schema validation along with MongoDB native driver for database operations.

## Rationale

### Why Joi + Native Driver over Mongoose

Mongoose requires its own connection pool management. The application already has an established MongoDB connection pool used across other repositories (form submissions, summary logs).

Introducing Mongoose would require maintaining two separate connection pools:

- Existing native driver connection pool for form submissions and summary logs
- Mongoose connection pool for organisations

This adds unnecessary complexity and resource overhead. Using Joi with the existing native driver connection pool maintains consistency across the codebase and avoids duplicate connection management.

**Trade-offs:**

While Mongoose provides a single schema for all CRUD operations, Joi requires separate schemas for insert and update. However, Joi's `.fork()` method allows deriving the update schema from the insert schema, minimizing duplication:

```javascript
organisationUpdateSchema = organisationInsertSchema
  .fork(['id', 'version', 'schemaVersion'], (schema) => schema.forbidden())
  .fork(updatableFields, (schema) => schema.optional())
```

### Why Joi + Native Driver over MongoDB Native $jsonSchema

**Schema evolution is easier:**

Joi schemas are maintained in application code, making evolution simpler:

- **Adding mandatory fields**: Set defaults for new fields, handle missing values on read (no data migration needed)
- **Renaming fields**: Support multiple schema versions in code, transform old field names on read
- **Changing types**: Gradually migrate data in application layer using `schemaVersion` field

MongoDB Native $jsonSchema requires immediate data migration:

- Must migrate all existing data before enabling new required fields
- Database-level validation changes (`collMod`) take effect immediately, requiring careful coordination with application deployments

**Better error messages:**

Joi provides detailed, customizable error messages that are easier to debug than generic $jsonSchema validation errors.
