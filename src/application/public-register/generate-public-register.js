import { transform } from '#application/public-register/public-register-transformer.js'
import { generateCsv } from '#application/public-register/csv-generator.js'
import { randomUUID } from 'node:crypto'
import { logger } from '#common/helpers/logging/logger.js'

/**
 * Format date as YYYYMMDD
 * @param {Date} date
 * @returns {string}
 */
function formatDateYYYYMMDD(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

/**
 * Generates the public register by processing organisation data and storing it
 *
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} organisationRepo - Organisation repository
 * @param {import('#domain/public-register/repository/port.js').PublicRegisterRepository} publicRegisterRepo - Public register repository
 * @returns {Promise<import('#domain/public-register/repository/port.js').PresignedUrlResult>} Pre-signed URL with expiry info for the generated public register file
 */
export async function generatePublicRegister(
  organisationRepo,
  publicRegisterRepo
) {
  logger.info({ message: 'Public register generation started' })

  const organisations = await organisationRepo.findAll()
  logger.info({
    message: `Retrieved ${organisations.length} organisations from repository`
  })

  logger.info({
    message: 'Starting transformation of organisations to public register rows'
  })
  const publicRegisterRows = await transform(organisations)
  logger.info({
    message: `Transformation complete: ${publicRegisterRows.length} rows generated`
  })

  logger.info({ message: 'Generating CSV from transformed data' })
  const publicRegisterCsv = await generateCsv(publicRegisterRows)
  logger.info({
    message: `CSV generation complete: ${publicRegisterCsv.length} characters`
  })

  const generationDate = formatDateYYYYMMDD(new Date())
  const fileName = `public-register-${generationDate}-${randomUUID()}.csv`

  logger.info({ message: `Saving public register to storage: ${fileName}` })
  await publicRegisterRepo.save(fileName, publicRegisterCsv)

  const result = await publicRegisterRepo.generatePresignedUrl(fileName)
  logger.info({
    message: `Public register generation completed: ${fileName}, URL expires at ${result.expiresAt}`
  })

  return result
}
