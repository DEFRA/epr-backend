export const EXTERNAL_API_TAG = 'external-api'

const STATUS_CODE_TO_ERROR_CODE = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORISED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'BAD_REQUEST',
  500: 'INTERNAL_SERVER_ERROR'
}

export const externalApiErrorFormatter = {
  plugin: {
    name: 'external-api-error-formatter',
    register: (server) => {
      server.ext('onPreResponse', (request, h) => {
        const response = request.response

        if (!response.isBoom) {
          return h.continue
        }

        const tags = request.route.settings.tags || []
        if (!tags.includes(EXTERNAL_API_TAG)) {
          return h.continue
        }

        const boomStatusCode = response.output.statusCode
        const statusCode = boomStatusCode === 422 ? 400 : boomStatusCode
        const code =
          STATUS_CODE_TO_ERROR_CODE[boomStatusCode] || 'INTERNAL_SERVER_ERROR'

        return h
          .response({ code, message: response.output.payload.message })
          .code(statusCode)
      })
    }
  }
}
