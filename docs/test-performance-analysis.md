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

## Update: Test Fixture Migration (2025-10-30)

**Implementation:** Migrated from global `setupFiles` to opt-in test fixtures using Vitest 4's `test.extend()` API.

**Fixtures Available:**

- `dbTest` - MongoDB only
- `s3Test` - S3 only
- `integrationTest` - Both MongoDB and S3
- `serverTest` - Full Hapi server with MongoDB
- `testServerFixture` - Hapi server with MongoDB and logger mocks (for route tests)

**Usage:**

```javascript
// Unit tests (no MongoDB) - import from 'vitest'
import { describe, it, expect } from 'vitest'

// Integration tests (need MongoDB) - import from fixture
import { serverTest as test, describe, expect } from '../.vite/db-fixture.js'

test('repository test', async ({ server }) => {
  const repository = createRepository(server.db)
  // ...
})
```

**Benefits:**

- Unit tests skip MongoDB setup entirely (6-second savings)
- Clear separation between unit and integration tests
- Better test isolation and faster feedback loops
- Explicit dependencies in test files

**Migration Status:**

- ✅ All repository tests converted
- ✅ All route tests converted
- ✅ Server tests converted
- ✅ Helper tests converted
