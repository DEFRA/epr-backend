import Joi from 'joi'

/**
 * Admin document view returns the whole stored summary log document as-is, plus
 * its version, for support triage. The shape is deliberately permissive: this is
 * a raw dump, so the schema must not fight the document as its structure evolves.
 */
export const summaryLogDocumentResponseSchema = Joi.object({
  version: Joi.number().required()
}).unknown(true)
