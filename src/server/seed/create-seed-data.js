import { ORG_ID_START_NUMBER } from '#common/enums/index.js'
import {
  extractAnswers,
  extractEmail,
  extractOrgName
} from '#common/helpers/apply/extract-answers.js'
import {
  accreditationFactory,
  organisationFactory,
  registrationFactory
} from '#common/helpers/collections/factories/index.js'
import { logger } from '#common/helpers/logging/logger.js'

import accreditationFixture from '#data/fixtures/accreditation.json' with { type: 'json' }
import organisationFixture from '#data/fixtures/organisation.json' with { type: 'json' }
import registrationFixture from '#data/fixtures/registration.json' with { type: 'json' }

import eprOrganisation1 from '#data/fixtures/common/epr-organisations/sample-organisation-1.json' with { type: 'json' }
import eprOrganisation2 from '#data/fixtures/common/epr-organisations/sample-organisation-2.json' with { type: 'json' }
import eprOrganisation3 from '#data/fixtures/common/epr-organisations/sample-organisation-3.json' with { type: 'json' }
import eprOrganisation4 from '#data/fixtures/common/epr-organisations/sample-organisation-4.json' with { type: 'json' }

import { ObjectId } from 'mongodb'
import { createEprOrganisationScenarios } from './seed-scenarios.js'

/** @import {Db} from 'mongodb' */
/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */

const COLLECTION_ORGANISATION = 'organisation'
const COLLECTION_REGISTRATION = 'registration'
const COLLECTION_ACCREDITATION = 'accreditation'
const COLLECTION_EPR_ORGANISATIONS = 'epr-organisations'

/**
 * Create seed data
 *
 * @async
 * @param {Db} db
 * @param {() => boolean} isProduction
 * @param {OrganisationsRepository} organisationsRepository
 * @returns {Promise<void>}
 */
export async function createSeedData(
  db,
  isProduction,
  organisationsRepository
) {
  if (!isProduction()) {
    logger.info({ message: 'Create seed data: start' })

    await createOrgRegAccFixtures(db)
    await createEprOrganisationFixtures(db, organisationsRepository)
    await createEprOrganisationScenarios(db, organisationsRepository)
  }
}

async function createOrgRegAccFixtures(db) {
  const organisationDocCount = await db
    .collection(COLLECTION_ORGANISATION)
    .countDocuments()

  if (organisationDocCount === 0) {
    logger.info({
      message: 'Create seed data: inserting org/reg/acc fixtures'
    })
    const organisationAnswers = extractAnswers(organisationFixture)

    const { insertedIds } = await db
      .collection(COLLECTION_ORGANISATION)
      .insertMany([
        organisationFactory({
          orgId: ORG_ID_START_NUMBER,
          orgName: extractOrgName(organisationAnswers),
          email: extractEmail(organisationAnswers),
          nations: null,
          answers: organisationAnswers,
          rawSubmissionData: organisationFixture
        })
      ])

    await db.collection(COLLECTION_REGISTRATION).insertMany([
      registrationFactory({
        referenceNumber: insertedIds[0]?.toString(),
        orgId: ORG_ID_START_NUMBER,
        answers: extractAnswers(registrationFixture),
        rawSubmissionData: registrationFixture
      })
    ])

    await db.collection(COLLECTION_ACCREDITATION).insertMany([
      accreditationFactory({
        referenceNumber: insertedIds[0]?.toString(),
        orgId: ORG_ID_START_NUMBER,
        answers: extractAnswers(accreditationFixture),
        rawSubmissionData: accreditationFixture
      })
    ])
  }
}

async function createEprOrganisationFixtures(db, organisationsRepository) {
  const eprOrganisationFixturesIds = [
    eprOrganisation1,
    eprOrganisation2,
    eprOrganisation3,
    eprOrganisation4
  ]
    .map((record) => record.id)
    .map(ObjectId.createFromHexString)

  const eprOrganisationFixturesDocs = await db
    .collection(COLLECTION_EPR_ORGANISATIONS)
    .find({ _id: { $in: eprOrganisationFixturesIds } })
    .toArray()

  if (eprOrganisationFixturesDocs.length === 0) {
    logger.info({
      message: 'Create seed data: inserting epr-organisation fixtures'
    })

    await Promise.all([
      organisationsRepository.insert(eprOrganisation1),
      organisationsRepository.insert(eprOrganisation2),
      organisationsRepository.insert(eprOrganisation3),
      organisationsRepository.insert(eprOrganisation4)
    ])
  }
}
