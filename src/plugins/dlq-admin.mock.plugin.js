const createNoOpDlqService = () => ({
  getStatus: async () => ({ approximateMessageCount: 0 }),
  purge: async () => {}
})

export const mockDlqAdminPlugin = {
  name: 'dlq-admin',
  version: '1.0.0',

  register: (server, options = {}) => {
    const dlqService = options.dlqService ?? createNoOpDlqService()
    server.decorate('request', 'dlqService', () => dlqService, { apply: true })
  }
}

export { mockDlqAdminPlugin as dlqAdminPlugin }
