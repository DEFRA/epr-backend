import Joi from 'joi'

/**
 * Shared Joi schemas for loads classification
 *
 * Storage and the route response want different things from the same shape.
 * Summary logs written before ROW_ID coercion hold row IDs as numbers, so the
 * storage schema has to keep accepting them; the read path normalises those to
 * strings, so the response contract can promise strings outright.
 */

const buildLoadsSchemas = (rowIdSchema) => {
  const category = Joi.object({
    count: Joi.number().integer().min(0).required(),
    rowIds: Joi.array().items(rowIdSchema).max(100).required()
  })

  const validity = Joi.object({
    valid: category.required(),
    invalid: category.required(),
    included: category.required(),
    excluded: category.required()
  })

  return {
    loadCategorySchema: category,
    loadValiditySchema: validity,
    loadsSchema: Joi.object({
      added: validity.required(),
      unchanged: validity.required(),
      adjusted: validity.required()
    })
  }
}

export const { loadCategorySchema, loadValiditySchema, loadsSchema } =
  buildLoadsSchemas(Joi.alternatives().try(Joi.string(), Joi.number()))

export const { loadsSchema: responseLoadsSchema } = buildLoadsSchemas(
  Joi.string()
)
