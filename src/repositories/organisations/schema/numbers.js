import Joi from 'joi'

const numberSchema = Joi.string().trim().uppercase().empty(null)

export const normalisedRegistrationNumberSchema = numberSchema

export const normalisedAccreditationNumberSchema = numberSchema
