# 21. Idempotent Operations and Retry Mechanisms for Resilient Data Processing

Date: 2025-01-11

## Status

Proposed

## Context

When processing operations that modify large datasets, several challenges arise:

1. **Partial Failure Recovery**: The system could crash mid-operation, leaving some records updated and others not
2. **Concurrency Control**: Multiple operations might attempt to modify the same data simultaneously
3. **Data Consistency**: Users need to see consistent data, but full atomic transactions are not always practical
4. **Transient Failures**: Network issues, database timeouts, and other temporary failures can interrupt processing
5. **Operational Clarity**: Avoiding ambiguous state in production to reduce the need to access sensitive data for investigation

### Technical Constraints

When working with large datasets (thousands to tens of thousands of records):

- MongoDB transaction size limit: 16MB
- MongoDB transaction time limit: 60 seconds
- These constraints make multi-document transactions impractical for bulk operations

### Alternatives Considered

**Distributed Transactions**: Not practical due to database transaction size and time limits for large-scale operations.

**Compensating Transactions**: Would require complex rollback logic and still leave periods of inconsistent state during rollback.

## Decision

We will use **idempotent operations with queue-based retry mechanisms** to protect against conflicts and mitigate transient errors.

### Core Principles

#### 1. Idempotent Operations

Design operations so they can be safely retried without producing duplicate or incorrect results:

- Tag each write operation with a unique identifier from the originating request
- Before applying changes, check if changes from this request have already been applied
- Skip already-applied operations; proceed with unapplied ones

This allows safe retry after partial failures without risk of duplication.

#### 2. Conflict Prevention Through Constraints

Prevent concurrent modifications that could conflict:

- Enforce business-level constraints (e.g. one active operation per entity scope)
- Use optimistic locking on aggregate state transitions
- Validate constraints before processing to fail fast

Constraints simplify idempotency by reducing the scenarios where operations could conflict.

#### 3. Queue-Based Retry Mechanisms

Handle transient failures through message queues with structured retry:

- Operations are processed via message queues
- Failed operations are automatically retried with exponential backoff
- Dead Letter Queue (DLQ) captures operations that exhaust retry attempts for investigation
- Queue-based processing decouples request handling from potentially long-running operations

This provides automatic recovery from transient failures (network issues, database timeouts) without manual intervention.

## Consequences

### Positive

#### Resilience

- Safe retry after partial failures - no risk of duplicate writes
- Works within database practical limits (no multi-document transactions needed)
- Clear recovery path: retry the entire operation
- Queue-based retry automatically handles transient failures

#### Operational Clarity

- Avoids ambiguous state in production
- Clear status transitions for support investigation
- Reduces need to access sensitive data during troubleshooting
- DLQ provides visibility into operations requiring manual intervention

#### Scalability

- Handles large-scale operations efficiently
- Bulk operations minimise database round-trips

#### User Experience

- Conflict prevention provides clear error messages when operations cannot proceed
- Automatic retry reduces user-visible failures from transient issues

### Negative

#### Concurrency Restrictions

- Conflict prevention constraints may block concurrent operations on related data
- Trade-off: Simpler than allowing concurrent operations and dealing with complex merge conflicts
- Must communicate wait states clearly to users

#### Infrastructure Complexity

- Requires CDP-provided message queue infrastructure (provisioning, monitoring)
- DLQ items require investigation and potential manual intervention
- Trade-off: Infrastructure complexity enables automatic recovery and operational simplicity

#### Partial Failure Visibility

- Operations may be in partially-completed state until retry finishes
- System must tolerate and recover from partially-applied changes
- Trade-off: Idempotency ensures retry brings all data to correct state
- Downstream operations must handle incomplete data appropriately

#### Application Complexity

- Idempotency logic must be carefully designed and tested
- Unique identifiers must be maintained throughout operation lifecycle
- Constraint enforcement adds validation overhead
- Trade-off: Application complexity enables operational simplicity and data protection

## References

See the [Low Level Design](../defined/summary-log-submission-lld.md) for application to summary log submission.
