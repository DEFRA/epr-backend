/**
 * Converts a Hapi path template with placeholders into a RegExp pattern
 * @param {string} pathTemplate - The path template with placeholders (e.g., '/v1/organisations/{organisationId}/link')
 * @param {Object<string, string>} [replacements] - Object mapping placeholder names to regex patterns
 * @returns {RegExp} A RegExp that matches the path template with actual values
 *
 * @example
 * const regex = createPathRegex('/v1/organisations/{organisationId}/link', {
 *   organisationId: '[0-9a-f]{24}'
 * })
 * regex.test('/v1/organisations/6507f1f77bcf86cd79943901/link') // true
 */
export function createPathRegex(pathTemplate, replacements = {}) {
  let pattern = pathTemplate

  // Replace each placeholder with its corresponding regex pattern
  for (const [placeholder, regexPattern] of Object.entries(replacements)) {
    pattern = pattern.replace(`{${placeholder}}`, regexPattern)
  }

  return new RegExp(`^${pattern}$`, 'i')
}

/**
 * Common regex patterns for path parameters
 */
export const PATH_PATTERNS = {
  /** MongoDB ObjectId (24 hexadecimal characters) */
  MONGO_OBJECT_ID: '[0-9a-f]{24}',
  /** UUID v4 format */
  UUID_V4: '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
}
