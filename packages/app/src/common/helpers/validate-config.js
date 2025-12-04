export function validateConfig(config) {
  let serviceMaintainers
  try {
    serviceMaintainers = JSON.parse(config.get('roles.serviceMaintainers'))
  } catch (error) {
    throw new Error(
      'Invalid roles.serviceMaintainers configuration: malformed JSON',
      {
        cause: error
      }
    )
  }

  if (!Array.isArray(serviceMaintainers)) {
    throw new Error(
      'Invalid roles.serviceMaintainers configuration: not an array'
    )
  }
}
