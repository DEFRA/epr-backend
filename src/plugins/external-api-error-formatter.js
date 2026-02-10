import { StatusCodes } from 'http-status-codes'

export const EXTERNAL_API_TAG = 'external-api'

const STATUS_CODE_TO_ERROR_CODE = {
  [StatusCodes.BAD_REQUEST]: 'BAD_REQUEST',
  [StatusCodes.UNAUTHORIZED]: 'UNAUTHORISED',
  [StatusCodes.FORBIDDEN]: 'FORBIDDEN',
  [StatusCodes.NOT_FOUND]: 'NOT_FOUND',
  [StatusCodes.CONFLICT]: 'CONFLICT',
  [StatusCodes.UNPROCESSABLE_ENTITY]: 'BAD_REQUEST',
  [StatusCodes.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR'
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
        const statusCode =
          boomStatusCode === StatusCodes.UNPROCESSABLE_ENTITY
            ? StatusCodes.BAD_REQUEST
            : boomStatusCode
        const code =
          STATUS_CODE_TO_ERROR_CODE[boomStatusCode] || 'INTERNAL_SERVER_ERROR'

        return h
          .response({ code, message: response.output.payload.message })
          .code(statusCode)
      })
    }
  }
}
