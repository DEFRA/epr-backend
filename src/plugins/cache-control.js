const cacheControl = {
  plugin: {
    name: 'cache-control',
    version: '1.0.0',
    register: (server) => {
      server.ext('onPreResponse', (request, h) => {
        const response = request.response

        if (response.isBoom) {
          response.output.headers['cache-control'] =
            'no-cache, no-store, must-revalidate'
        } else {
          response.header(
            'Cache-Control',
            'no-cache, no-store, must-revalidate'
          )
        }

        return h.continue
      })
    }
  }
}

export { cacheControl }
