/**
 * @typedef {Object} MockDlqServicePluginOptions
 * @property {{ getStatus: Function, purge: Function }} [dlqService] - Mock service to use
 */

/** @returns {{ getStatus: Function, purge: Function }} */
const createNoOpDlqService = () => ({
  getStatus: async () => ({ approximateMessageCount: 0 }),
  purge: async () => {}
})

// No SQS — returns no-op defaults for predictable test behaviour.
// Exported as both names: mockDlqServicePlugin for createTestServer,
// dlqServicePlugin for vi.mock factory replacement.
export const mockDlqServicePlugin = {
  name: 'dlq-service',
  version: '1.0.0',

  /** @param {MockDlqServicePluginOptions} [options] */
  register: (server, options = {}) => {
    const dlqService = options.dlqService ?? createNoOpDlqService()

    server.decorate('request', 'dlqService', () => dlqService, { apply: true })
  }
}

export { mockDlqServicePlugin as dlqServicePlugin }
