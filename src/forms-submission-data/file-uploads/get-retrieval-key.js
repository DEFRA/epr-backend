/**
 * Each regulator's email addresses, keyed by the regulator's code in capitals.
 * `defraFormsSubmissionEmail` is the address a regulator's Defra form is set
 * up with, where it differs from the regulator's own.
 *
 * @typedef {Record<string, { email: string, defraFormsSubmissionEmail?: string }>} RegulatorEmails
 */

/**
 * The key the Forms Submission API takes for a regulator's files: the email
 * address the regulator's form is set up with, in lower case.
 *
 * @param {RegulatorEmails} regulators
 * @param {string} regulator
 */
export const getRetrievalKeyForRegulator = (regulators, regulator) => {
  const regulatorKey = regulator.toUpperCase()
  const emails = regulators[regulatorKey]

  if (!emails) {
    throw new Error(`No email address is configured for ${regulatorKey}`)
  }

  return (emails.defraFormsSubmissionEmail ?? emails.email).toLowerCase()
}
