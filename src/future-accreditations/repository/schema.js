import { yearSchema } from '#common/validation/year-schema.js'
import { FUTURE_ACCREDITATIONS_FROM_YEAR } from '#organisation-read-model/domain/model.js'
import { accreditationCommonSchema } from '#organisation-read-model/domain/schema.js'
import { normalisedRegistrationNumberSchema } from '#repositories/organisations/schema/numbers.js'

export const futureAccreditationSchema = accreditationCommonSchema.keys({
  registrationNumber: normalisedRegistrationNumberSchema.required(),
  year: yearSchema().min(FUTURE_ACCREDITATIONS_FROM_YEAR).required()
})
