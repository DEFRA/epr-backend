# Backend Test Performance Analysis

**Date**: 30 October 2025
**Test Suite**: epr-backend
**Total Tests**: 473 tests across 46 files
**Coverage Requirement**: 100%

## Executive Summary

The backend test suite takes **11.43 seconds** to complete, with **53% of that time (6.04s) spent in setup**. MongoDB Memory Server initialization is the primary bottleneck. While several optimizations were tested, most provided negligible improvements or broke test isolation.

## Current Performance Breakdown

```
Total Duration:     11.43s
├── Setup:          6.04s (53%)  ← Primary bottleneck
├── Test Collection: 11.01s
├── Transform:      0.87s
├── Prepare:        3.19s
└── Tests:          81.82s (cumulative across parallel workers)
```

## Experiments Conducted

| Optimization             | Time   | Change | Status                     |
| ------------------------ | ------ | ------ | -------------------------- |
| Baseline                 | 11.43s | —      | Current state              |
| Disable coverage         | 10.52s | -8%    | ✅ Works for dev           |
| Disable isolation        | 11.81s | +3%    | ❌ Breaks 20 tests         |
| Disable file parallelism | 55.39s | +384%  | ❌ Significantly slower    |
| Threads pool             | 12.96s | +13%   | ❌ Slower                  |
| Pin MongoDB version      | 11.34s | -1%    | ⚠️ No measurable impact    |
| Reduce to 4 workers      | 20.51s | +79%   | ❌ Much slower             |
| Increase to 16 workers   | 10.50s | -8%    | ⚠️ Marginal gain, high CPU |
| Global MongoDB setup     | 6.13s  | -46%   | ❌ Breaks test isolation   |
| Global S3 only           | 10.93s | -4%    | ⚠️ Minimal benefit         |

## Key Findings

### 1. MongoDB Memory Server is the Bottleneck

Each of the 46 test files spawns its own MongoDB instance during setup. This accounts for the majority of the 6.04s setup time. The overhead is:

- Starting MongoDB process
- Waiting for ready state
- Creating collections with validation schemas
- Tearing down after tests complete

### 2. Parallelism is Already Optimal

The test runner is effectively using the available 12 CPU cores. The current parallel execution strategy provides the best balance of speed and resource utilization.

### 3. Coverage is Not the Problem

Coverage analysis adds approximately 1 second to the total runtime. Given the 100% coverage requirement, this overhead is acceptable and necessary.

### 4. Test Isolation Prevents Easy Wins

The most significant performance improvement (-46%) would come from using global MongoDB setup, but this breaks test isolation as tests share database state and produce conflicts.

## Recommendations

### Immediate (No Code Changes)

**For Development Workflow:**

```bash
# Skip coverage for 8% speedup during rapid iteration
TZ=UTC npx vitest run

# Run specific test files
npm test -- path/to/test.js

# Run tests matching a pattern
npm test -- -t "registration"
```

### Short-term (Low Effort)

1. **Organize tests by type**:
   - Separate unit tests (no MongoDB) from integration tests
   - Run unit tests during development for faster feedback
   - Run full suite before commits

2. **Use test sharding in CI** (if CI performance becomes an issue):
   ```bash
   npm test -- --shard=1/4
   npm test -- --shard=2/4
   ```

### Long-term (High Effort, High Reward)

**Refactor for Global MongoDB Setup** (~46% faster)

To achieve the 6.13s runtime from global setup while maintaining test isolation:

1. **Use unique database names per test**:

   ```js
   const dbName = `test-${Date.now()}-${Math.random()}`
   ```

2. **Implement proper collection cleanup** in afterEach hooks

3. **Use MongoDB transactions** for test isolation where appropriate

**Estimated Effort**: 2-3 days to refactor 46 test files
**Expected Benefit**: Reduce runtime from 11.43s to ~6-7s

## Conclusion

**11.43 seconds for 473 tests with 100% coverage is reasonable performance.** The test suite effectively uses parallel execution and the bottleneck is an inherent cost of test isolation with MongoDB Memory Server.

Unless test execution time becomes a significant developer friction point, the current performance is acceptable. If faster tests become a priority, investing in refactoring for global setup is the only path to meaningful improvement.

## Appendix: Environment

- **Platform**: macOS Darwin 25.0.0
- **CPUs**: 12 cores
- **Node Version**: v22.19.0
- **Vitest Version**: 4.0.4
- **Test Framework**: Vitest with MongoDB Memory Server
- **Coverage Provider**: v8

## Update: Test Fixture Migration - Hybrid Approach (2025-10-30)

**Implementation:** Hybrid approach - fixtures for route tests, `beforeAll` for repository tests.

**Why Hybrid?**

Initial attempt to migrate all tests to fixtures failed because:

- Contract test functions (`testSummaryLogsRepositoryContract`) register tests at import/parse time
- Fixtures only provide values at test-run time
- Calling contract tests inside fixture `test()` functions resulted in 91 missing tests (543 → 452)
- Coverage dropped from 100% to 97.87%

**Solution:** Use fixtures only where they work - route tests with single test cases.

**Fixtures Available:**

- `testServerFixture` - Hapi server with MongoDB and logger mocks (for route tests only)

**Usage Patterns:**

```javascript
// Route tests - USE FIXTURES
import {
  testServerFixture as test,
  describe,
  expect
} from '../../test/create-test-server-fixture.js'

test('GET /health returns 200', async ({ testServer }) => {
  const response = await testServer.inject({ method: 'GET', url: '/health' })
  expect(response.statusCode).toBe(200)
})

// Repository tests - USE beforeAll (contract tests require this)
describe('MongoDB summary logs repository', () => {
  let server
  let repositoryFactory

  beforeAll(async () => {
    const { createServer } = await import('#server/server.js')
    server = await createServer()
    await server.initialize()
    repositoryFactory = createRepository(server.db)
  })

  afterAll(async () => {
    await server.stop()
  })

  // Contract test registers nested tests - requires beforeAll pattern
  testSummaryLogsRepositoryContract((logger) => repositoryFactory(logger))
})
```

**Performance Impact:**

| Metric             | Main   | PAE-449 | Change         |
| ------------------ | ------ | ------- | -------------- |
| **Total Duration** | 12.05s | 12.56s  | +0.51s (+4%)   |
| **Transform**      | 8.74s  | 6.46s   | -2.28s (-26%)  |
| **Setup**          | 6.95s  | 7.73s   | +0.78s (+11%)  |
| **Tests**          | 543    | 543     | ✅ All passing |
| **Coverage**       | 100%   | 100%    | ✅ Maintained  |

**Benefits:**

- Route tests cleaner with fixture pattern
- Repository tests work correctly with contract patterns
- All 543 tests passing
- 100% coverage maintained
- Slight performance improvement in transform phase

**Migration Status:**

- ✅ All route tests using fixtures
- ✅ Repository tests using beforeAll (contract test compatibility)
- ✅ Helper tests using beforeAll
- ✅ Full test suite passing

## Update: In-Memory Test Optimization (2025-10-30)

**Implementation:** Conditional MongoDB plugin registration allows in-memory tests to skip MongoDB Memory Server entirely.

**Problem:** 6 route test files used in-memory repositories but still paid ~6-7 second MongoDB startup cost per file.

**Solution:**

1. Made MongoDB plugin registration conditional in `server.js` (`skipMongoDb` option)
2. Auto-detect in-memory mode in `createTestServer` when repositories provided
3. Updated repositories plugin to skip MongoDB dependency check when not available

**Performance Impact:**

- **Individual in-memory tests**: ~6-7s → ~300-400ms (**95% faster**)
- **4 in-memory route tests together**: 1.35s total
- **Full suite**: 543 tests passing, 100% coverage maintained

**Files Optimized:**

- `src/routes/v1/organisations/get.test.js`
- `src/routes/v1/organisations/get-by-id.test.js`
- `src/routes/v1/organisations/registrations/summary-logs/validate/post.test.js`
- `src/routes/v1/organisations/registrations/summary-logs/upload-completed/post.test.js`
- `src/routes/v1/organisations/registrations/summary-logs/upload-completed/post.validation.test.js`
- `src/routes/v1/organisations/registrations/summary-logs/integration.test.js`

**See:** [In-Memory Optimization Details](./in-memory-optimization.md) for implementation details.
