# Performance Tests

The `epr-backend-performance-tests` repository includes a JMeter script that can be executed against the `perf-test` environment,

Currently it only tests against the Organisation, Accreditation and Registration endpoints.

There is a `DataGenerator` step on each run, but the result can be ignored as it is only used to generate data.

Generally speaking we look for performance that is less than 2000ms on the 99th percentile (Worst case) and a throughput of approximately 20 transaactions per second is deemed acceptable as it is not a busy service.

Bear in mind that the performance environment is a shared environment, so you may or may not encounter some variance in performance.

The hardware configuration in the `perf-test` environment is similar to the `prod` environment.
