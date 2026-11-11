import { transform } from '#application/public-register/public-register-transformer.js'
import { generateCsv } from '#application/public-register/csv-generator.js'
import { generateReportCompliance } from '#reports/application/report-compliance.js'
import { randomUUID } from 'node:crypto'
import { logger } from '#common/helpers/logging/logger.js'

/**
 * Format date as YYYYMMDD
 * @param {Date} date
 * @returns {string}
 */
const DATE_PART_WIDTH = 2

function formatDateYYYYMMDD(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(DATE_PART_WIDTH, '0')
  const day = String(date.getDate()).padStart(DATE_PART_WIDTH, '0')
  return `${year}${month}${day}`
}

/**
 * Generates the public register by processing organisation data and storing it
 *
 * @param {import('#organisation-read-model/repository/port.js').OrganisationReadRepository} organisationReadRepository - Organisation read model
 * @param {import('#domain/public-register/repository/port.js').PublicRegisterRepository} publicRegisterRepo - Public register repository
 * @param {import('#reports/repository/port.js').ReportsRepository} reportsRepository - Reports repository
 * @returns {Promise<import('#domain/public-register/repository/port.js').PresignedUrlResult>} Pre-signed URL with expiry info for the generated public register file
 */
export async function generatePublicRegister(
  organisationReadRepository,
  publicRegisterRepo,
  reportsRepository
) {
  logger.info({ message: 'Public register generation started' })

  const organisations = await organisationReadRepository.findAll()
  logger.info({
    message: `Retrieved ${organisations.length} organisations from the read model`
  })
  const complianceData = await generateReportCompliance(
    organisations,
    reportsRepository
  )

  logger.info({
    message: 'Starting transformation of organisations to public register rows'
  })
  const publicRegisterRows = await transform(organisations, complianceData)
  logger.info({
    message: `Transformation complete: ${publicRegisterRows.length} rows generated`
  })

  logger.info({ message: 'Generating CSV from transformed data' })
  const publicRegisterCsv = await generateCsv(
    publicRegisterRows,
    complianceData.periods
  )
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
