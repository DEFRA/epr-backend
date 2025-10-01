# 8. Forms data physical data model

Date: 2025-10-01

## Status

Accepted

## Context

There is a set of forms provided to users as part of a contingency solution to apply for registration and accreditations.

This describes the physical data model for storing data collected through forms in MongoDB. Two approaches were evaluated: a single nested collection with embedded documents vs. separate collections with references.

### Application characteristics

- **Update frequency**: Initial inserts followed by infrequent updates throughout the year
- **Primary access pattern**: Often need all details for an organisation (org + registrations + accreditations)

## Options Considered

### Option 1: Single Nested Collection

Store organisations with embedded arrays of registrations and accreditations in a single collection.

**Structure:**

```javascript
{
  _id: ObjectId,
  orgId: Integer,
  schemaVersion: Integer,
  version: Integer,  // for optimistic locking
  wasteProcessingTypes: Array<String>,
  businessType: String,
  companyDetails: { ... },
  registrations: [
    { id: ObjectId, status: String, material: String, ... }
  ],
  accreditations: [
    { id: ObjectId, status: String, material: String, ... }
  ]
}
```

**Advantages:**

- Single query retrieves complete organisation data
- Strong data locality - related data stored together
- Atomic operations across organisation and nested documents
- Simpler application code - no joins required

**Disadvantages:**

- Updates to individual registrations lock entire organisation document
- Risk of hitting MongoDB's 16MB document limit, unlikely considering 3 registration/accreditation document size is at ~9KB.

### Option 2: Separate Collections

Store organisations, registrations, and accreditations in three separate collections with references.

**Structure:**

```javascript
// organisations collection
{ _id: ObjectId, orgId: Integer, ... }

// registrations collection
{ _id: ObjectId, orgId: Integer, status: String, material: String, ... }

// accreditations collection
{ _id: ObjectId, orgId: Integer, status: String, material: String, ... }
```

**Advantages:**

- Can query registrations independently
- Fine-grained locking - updating one registration doesn't lock organisation
- No document size limits
- Better scalability for high-volume registrations/accreditations

**Disadvantages:**

- Requires join queries ($lookup) to get complete organisation data
- More complex application code to manage relationships
- No atomic operations across collections without transactions

## Decision

Use a **single nested collection** where organisations contain embedded arrays of registrations and accreditations, following the [MongoDB embedded document pattern](https://www.mongodb.com/docs/manual/core/data-model-design/#embedded-data-models).

### Why Single Nested Collection

The decision is driven by our specific workload characteristics:

**1. Access patterns favour embedding**

The application frequently needs complete organisation data (organisation + all registrations + all accreditations). With embedded documents, this requires a single query. With separate collections, this requires a `$lookup` aggregation across three collections.

**2. Document size is well-bounded**

With an average of 3 registrations and 3 accreditations per organisation, documents average 9KB - well below MongoDB's 16MB document limit. The distribution is bounded by the number of sites and materials each organisation processes, making it unlikely that any single organisation will approach document size limits.

**3. Update frequency is low**

After initial form submissions, registrations and accreditations are updated infrequently. This makes the document-level locking overhead of embedded documents negligible. Both approaches show identical update performance when properly indexed.

**4. Write performance is better or equivalent**

Benchmarks show 1ms median insert time for nested collection vs 3ms(1ms for each collection) for separate collection

**5. Atomic operations are valuable**

Embedding enables atomic updates across organisation and related registrations/accreditations without requiring multi-document transactions. This simplifies error handling and ensures data consistency.

**6. Simpler application code**

No need to manage relationships, coordinate writes across collections, or construct join queries. A single collection reduces operational complexity and maintenance burden.

### Trade-offs

**What we give up:**

- Ability to efficiently query individual registrations without organisation context
- Fine-grained locking (entire document locked during updates)
- Flexibility to scale to extremely high-volume organisations (1000+ registrations/accreditations)

These trade-offs are acceptable given our current access patterns and data volumes.

## Performance Benchmarks

All benchmarks performed with schema validation and appropriate indexes unless noted otherwise.

### Data volume for test

- **Scale**: ~20,000 organisations, ~60,000 registrations, ~60,000 accreditations
- **Distribution**: Average of 3 registrations and 3 accreditations per organisation

### Environmentregistrations

Local dev machine with `32GB(10GB free memory)` and `AMD Ryzen 7 PRO 7840U`

### Insert Performance

**Single Nested Collection**

| Configuration               | Documents | Median | P95   | P99   | Avg Size | Total Size |
| --------------------------- | --------- | ------ | ----- | ----- | -------- | ---------- |
| No validation, no indexes   | 20,000    | 1ms    | 1ms   | 3.3ms | 9KB      | -          |
| With validation, no indexes | 20,000    | 1ms    | 1.5ms | 4.3ms | 9KB      | -          |
| With validation, 7 indexes  | 20,000    | 1ms    | 1.7ms | 4.3ms | 9KB      | 177MB      |

**Separate Collections**

| Collection     | Documents | Median | P95 | P99    | Avg Size | Total Size |
| -------------- | --------- | ------ | --- | ------ | -------- | ---------- |
| Organisations  | 20,000    | 1ms    | 1ms | 4.2ms  | 0.7KB    | 13MB       |
| Registrations  | 60,000    | 1ms    | 1ms | 1.75ms | 1.5KB    | 90MB       |
| Accreditations | 60,000    | 1ms    | 1ms | 1.6ms  | 1.5KB    | 75MB       |
| **Combined**   | 140,000   | 1ms    | 1ms | 4.2ms  | 3.7KB    | **178MB**  |

### Update Performance (Registration Status Updates)

**Single Nested Collection**

| Configuration               | Median | P95  | P99  |
| --------------------------- | ------ | ---- | ---- |
| No indexes                  | 11ms   | 23ms | 26ms |
| With validation, no indexes | 13ms   | 25ms | 27ms |
| With validation and indexes | 1ms    | 2ms  | 3ms  |

**Separate Collections**

| Configuration               | Median | P95 | P99 |
| --------------------------- | ------ | --- | --- |
| With validation and indexes | 1ms    | 1ms | 3ms |

### Read Performance

**Without Indexes** (Single Collection)

| Query Type         | Median | P95  | P99  |
| ------------------ | ------ | ---- | ---- |
| By orgId           | 6ms    | 10ms | 26ms |
| By registrationId  | 15ms   | 24ms | 28ms |
| By accreditationId | 15ms   | 27ms | 30ms |

**With Indexes**

| Query Type                                      | Approach              | Median  | P95     | P99     |
| ----------------------------------------------- | --------------------- | ------- | ------- | ------- |
| Fetch org by orgId                              | Single Collection     | 1ms     | 3ms     | 5ms     |
| Fetch org by orgId                              | Separate (no join)    | 1ms     | 4ms     | 6ms     |
| Fetch registration by ID                        | Single Collection     | 1ms     | 3ms     | 5ms     |
| Fetch registration by ID                        | Separate              | 1ms     | 2ms     | 3ms     |
| Fetch accreditation by ID                       | Single Collection     | 1ms     | 3ms     | 5ms     |
| Fetch accreditation by ID                       | Separate              | 1ms     | 1.5ms   | 2.5ms   |
| **Fetch org + regs + accs (complete data)**     | **Single Collection** | **1ms** | **3ms** | **5ms** |
| **Fetch org + regs + accs (join with $lookup)** | **Separate**          | **2ms** | **5ms** | **6ms** |

**Key Takeaway**: For the primary use case (fetching complete organisation data), single nested collection is 2x faster (1ms vs 2ms median).
