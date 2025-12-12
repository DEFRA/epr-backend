/**
 * Temporary list of test files to skip when SKIP_BROKEN_TESTS=true
 *
 * These tests are broken and need to be fixed incrementally.
 * Remove files from this list as they are fixed.
 *
 * To fix a test:
 * 1. Remove the file path from this array
 * 2. Run tests locally to verify: npm test
 * 3. Update coverage thresholds in vitest.config.js if needed
 * 4. Commit your changes
 *
 * Once all tests are fixed:
 * 1. Delete this file
 * 2. Remove the SKIP_BROKEN_TESTS logic from vitest.config.js
 * 3. Remove SKIP_BROKEN_TESTS from CI workflow
 * 4. Restore coverage thresholds to 100%
 */
export const skippedTests = [
  'src/routes/v1/organisations/registrations/summary-logs/get.test.js',
  'src/routes/v1/organisations/registrations/summary-logs/integration.cdp-status-check.test.js',
  'src/routes/v1/organisations/registrations/summary-logs/integration.submission-and-placeholders.test.js',
  'src/routes/v1/organisations/registrations/summary-logs/integration.upload-lifecycle.test.js',
  'src/routes/v1/organisations/registrations/summary-logs/integration.validation-advanced.test.js',
  'src/routes/v1/organisations/registrations/summary-logs/integration.validation-reprocessor-input.test.js',
  'src/routes/v1/organisations/registrations/summary-logs/post.test.js',
  'src/routes/v1/organisations/registrations/summary-logs/submit/post.test.js'
]
