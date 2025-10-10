# 10. Worker threads

Date: 2025-10-07

## Status

Proposed

## Context

We need to parse large Excel files, which is CPU-intensive work that can block the main event loop and impact API responsiveness.

Using worker threads allow CPU-intensive operations to run in parallel, ensuring:

- API endpoints remain responsive during file processing
- Multiple files can be processed concurrently
- Better utilization of multi-core systems

### Key Requirements

- Worker pool management to efficiently reuse threads
- Promise-based API for async operations
- Task queuing when all workers are busy
- Resource cleanup and worker lifecycle management
- TypeScript support for better developer experience
- Minimal overhead for thread creation/teardown
- Active maintenance and community support

## Decision

Use **Piscina** for worker thread pool management.

### Alternatives Considered

| Library                               | Pros                                                                                                                                                                                                                                                                                                                      | Cons                                                                                                                                                                                          | Decision        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| **Node.js native Worker Threads API** | No external dependencies. Complete control over thread lifecycle. Part of Node.js standard library.                                                                                                                                                                                                                       | Requires manual implementation of pooling, queuing, error handling, and resource management. Significantly more boilerplate code. Higher risk of resource leaks without proper cleanup logic. | ❌ Rejected     |
| **workerpool**                        | Mature library with good documentation. Supports both web workers and Node.js workers. Promise-based API.                                                                                                                                                                                                                 | Generic solution supporting multiple environments. Larger bundle size due to browser compatibility code. Less optimized for Node.js-specific use cases.                                       | ❌ Rejected     |
| **Piscina**                           | Built specifically for Node.js worker threads by core contributors. Highly optimized with minimal overhead. Clean Promise-based API. Automatic worker recycling and resource management. Excellent TypeScript support. Active maintenance with regular updates. Used in production by major projects (Fastify ecosystem). | Relatively newer library compared to workerpool (but actively developed). Less generic than multi-environment solutions.                                                                      | ✅ **Selected** |

### Licensing

All evaluated libraries use permissive licenses (MIT/Apache 2.0) that:

- Allow commercial/non-commercial use and modification
- Require only copyright attribution
- Are compatible with UK Government Licensing Framework

## Consequences

### Benefits

- Automatic worker pool management with intelligent load balancing
- Near-zero overhead thread recycling reduces resource consumption
- Promise-based API integrates seamlessly with async/await patterns
- Built-in error handling and graceful shutdown
- TypeScript types improve development experience and code quality
- Maintained by Node.js core contributors ensures alignment with platform best practices
- Production-proven in high-traffic applications

### Trade-offs

- Additional dependency vs. native API (though significantly reduces implementation complexity)
- Opinionated pool management may limit advanced customization scenarios
- Learning curve for team members unfamiliar with worker thread patterns

### Risks

- **Low Risk**: Library abandonment (actively maintained by Node.js ecosystem contributors)
- **Low Risk**: Breaking changes in updates (stable API, semantic versioning followed)
- **Mitigation**: Thread pool size should be configured based on available CPU cores to avoid over-subscription
