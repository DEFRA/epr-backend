import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { isProductionEnvironment } from '#root/config.js'
import { createSeedData } from './create-seed-data.js'

/** @import {Db} from 'mongodb' */

/**
 * @param {Db} db
 * @returns {Promise<void>}
 */
export async function seedDatabase(db) {
  const organisationsRepositoryFactory = await createOrganisationsRepository(db)

  await createSeedData(
    db,
    isProductionEnvironment,
    organisationsRepositoryFactory()
  )
}
