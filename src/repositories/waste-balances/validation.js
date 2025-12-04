export class ValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ValidationError'
  }
}

/**
 * Validate accreditation ID
 * @param {unknown} accreditationId
 * @returns {string}
 * @throws {ValidationError}
 */
export const validateAccreditationId = (accreditationId) => {
  if (
    typeof accreditationId !== 'string' ||
    accreditationId.trim().length === 0
  ) {
    throw new ValidationError(
      'accreditationId must be a non-empty string but got: ' +
        JSON.stringify(accreditationId)
    )
  }
  return accreditationId
}
