import { logger } from '#common/helpers/logging/logger.js'

const eprOrganisations = 'epr-organisations'

export async function truncateEprOrganisations(db) {
  try {
    logger.info({ message: `Truncating ${eprOrganisations} collection` })
    const result = await db.collection(eprOrganisations).deleteMany({})
    logger.info({
      message: `Successfully truncated collection ${eprOrganisations}, number of documents deleted: ${result.deletedCount}`
    })
  } catch (error) {
    logger.error({
      message: `Failed to truncate collection ${eprOrganisations}`,
      err: error
    })
  }
}
