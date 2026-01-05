const health = {
  method: 'GET',
  path: '/health',
  options: {
    auth: false,
    tags: ['api']
  },
  handler: (_request, h) => h.response({ message: 'success' })
}

export { health }
