// @fixme: add coverage
/* istanbul ignore file */
const health = {
  method: 'GET',
  path: '/health',
  handler: (_request, h) => h.response({ message: 'success' })
}

export { health }
