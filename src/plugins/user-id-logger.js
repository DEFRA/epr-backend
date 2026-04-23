export const userIdLogger = {
  plugin: {
    name: 'user-id-logger',
    version: '1.0.0',
    /**
     * @param {import('#common/hapi-types.js').HapiServer} server
     */
    register: (server) => {
      server.ext(
        'onPostAuth',
        /**
         * @param {import('#common/hapi-types.js').HapiRequest} request
         * @param {import('#common/hapi-types.js').HapiResponseToolkit} h
         */
        (request, h) => {
          const id = request.auth?.credentials?.id

          if (id) {
            request.logger = request.logger.child({ user: { id } })
          }

          return h.continue
        }
      )
    }
  }
}
