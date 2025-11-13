export const services = {
  plugin: {
    name: 'services',
    version: '1.0.0',
    register: (server, options) => {
      if (options?.syncWasteRecords) {
        server.decorate(
          'request',
          'syncWasteRecords',
          () => options.syncWasteRecords,
          {
            apply: true
          }
        )
      }
    }
  }
}
