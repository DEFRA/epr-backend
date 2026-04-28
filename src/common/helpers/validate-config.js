export function validateConfig(config) {
  let serviceMaintainers
  try {
    serviceMaintainers = JSON.parse(config.get('roles.serviceMaintainers'))
  } catch {
    throw new Error(
      'Invalid roles.serviceMaintainers configuration: malformed JSON'
    )
  }

  if (!Array.isArray(serviceMaintainers)) {
    throw new Error(
      'Invalid roles.serviceMaintainers configuration: not an array'
    )
  }
}
