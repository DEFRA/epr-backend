/**
 * @typedef {Object} MockWorkersPluginOptions
 * @property {import('#domain/summary-logs/worker/port.js').SummaryLogsCommandExecutor} [summaryLogsWorker] - Mock worker to use
 */

/**
 * Creates a no-op worker that does nothing.
 * Useful as a default when no mock is provided.
 * @returns {import('#domain/summary-logs/worker/port.js').SummaryLogsCommandExecutor}
 */
const createNoOpWorker = () => ({
  validate: async () => {},
  submit: async () => {}
})

/**
 * Mock workers adapter plugin for testing.
 * Accepts a mock worker via options for test control, or creates a no-op worker.
 * Does not use Piscina thread pool - runs synchronously for predictable test behaviour.
 */
export const mockWorkersPlugin = {
  name: 'workers',
  version: '1.0.0',

  /**
   * @param {import('@hapi/hapi').Server} server
   * @param {MockWorkersPluginOptions} [options]
   */
  register: (server, options = {}) => {
    const summaryLogsWorker = options.summaryLogsWorker ?? createNoOpWorker()

    server.decorate('request', 'summaryLogsWorker', () => summaryLogsWorker, {
      apply: true
    })
  }
}
