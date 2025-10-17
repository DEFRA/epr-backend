# 15. Use Mongoose for epr-organisations Schema

Date: 2025-01-16

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

Use Mongoose for the EPR organisations schema.

## Rationale

### Why Mongoose over Joi

**Single schema for all CRUD operations:**

With Mongoose, one schema handles all operations regardless of which field is being updated. With Joi, updating fields at different nesting depths requires separate schemas. For example:

- Updating `organisation.businessType` needs `organisationUpdateSchema`
- Updating `organisation.registrations[0].status` needs `registrationUpdateSchema`
- Updating `organisation.registrations[0].site.address.postcode` needs `addressUpdateSchema`

This means maintaining multiple schemas and manually selecting the correct one based on update depth, making Joi more verbose for deeply nested structures.

**Automatic timestamps:**

- Mongoose: `timestamps: true` handles `createdAt`/`updatedAt` automatically
- Joi: Must manually set on every update

**Middleware hooks:**

- Mongoose: Built-in `pre/post` hooks for validation, save, remove operations (useful for audit logs, side effects)
- Joi: No middleware system - must implement manually

### Why Mongoose over MongoDB Native $jsonSchema

**Schema evolution is easier:**

Mongoose schemas are maintained in application code, making evolution simpler:

- **Adding mandatory fields**: Set defaults for new fields, handle missing values on read (no data migration needed)
- **Renaming fields**: Support multiple schema versions in code, transform old field names on read
- **Changing types**: Gradually migrate data in application layer using `schemaVersion` field

MongoDB Native requires immediate data migration:

- Must migrate all existing data before enabling new required fields
- Database-level validation changes (`collMod`) take effect immediately, requiring careful coordination with application deployments

**Conditional validation is cleaner:**

- Mongoose: `required: function() { return this.wasteProcessingType === 'reprocessor' }`
- Native: Complex JSON Schema `if/then/else` syntax

## Mixed Approach

The codebase uses different validation approaches based on use case. This pragmatic approach leverages each tool's strengths for appropriate use cases. Future experience may lead to consolidation towards either Joi or Mongoose.
