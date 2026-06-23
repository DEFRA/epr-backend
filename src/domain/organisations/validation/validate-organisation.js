import { rules } from '#domain/organisations/validation/rules/index.js'

/** @import { Organisation } from '#domain/organisations/model.js' */

/**
 * Validates an organisation as a graph: cross-references between its embedded
 * registrations and accreditations that the per-item Joi schema never checks.
 * Pure — operates on the stored shape (registration.accreditationId +
 * org.accreditations[]), performs no I/O, and returns every issue every rule
 * raises.
 *
 * @param {Organisation} org
 * @returns {import('#domain/organisations/validation/issue.js').ValidationIssue[]}
 */
export const validateOrganisation = (org) =>
  rules.flatMap((rule) => rule.evaluate(org))
