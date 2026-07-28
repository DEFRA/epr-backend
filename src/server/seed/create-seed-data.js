import { ORG_ID_START_NUMBER } from '#common/enums/index.js'
import {
  extractAnswers,
  extractEmail,
  extractOrgName
} from '#domain/form-submissions/extract-answers.js'
import {
  accreditationSubmission,
  organisationSubmission,
  registrationSubmission
} from '#domain/form-submissions/submission-records.js'
import { logger } from '#common/helpers/logging/logger.js'
import { ObjectId } from 'mongodb'
import { createEprOrganisationScenarios } from './seed-scenarios.js'

import accreditationFixture from '#data/fixtures/accreditation.json' with { type: 'json' }
import organisationFixture from '#data/fixtures/organisation.json' with { type: 'json' }
import registrationFixture from '#data/fixtures/registration.json' with { type: 'json' }

import eprOrganisation1 from '#data/fixtures/common/epr-organisations/sample-organisation-1.json' with { type: 'json' }
import eprOrganisation2 from '#data/fixtures/common/epr-organisations/sample-organisation-2.json' with { type: 'json' }
import eprOrganisation3 from '#data/fixtures/common/epr-organisations/sample-organisation-3.json' with { type: 'json' }
import eprOrganisation4 from '#data/fixtures/common/epr-organisations/sample-organisation-4.json' with { type: 'json' }

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

/**
 * The organisation collection requires a name and an email, so a fixture
 * missing either would be rejected by the schema on insert. Fail here instead,
 * where the cause is obvious.
 *
 * @param {object} rawSubmissionData
 * @returns {import('#domain/form-submissions/submission-records.js').OrganisationSubmission}
 */
export function seedOrganisationRecord(rawSubmissionData) {
  const answers = extractAnswers(rawSubmissionData)
  const orgName = extractOrgName(answers)
  const email = extractEmail(answers)

  if (!orgName || !email) {
    throw new Error(
      'Create seed data: organisation fixture is missing an organisation name or email'
    )
  }

  return organisationSubmission({
    orgId: ORG_ID_START_NUMBER,
    orgName,
    email,
    nations: null,
    answers,
    rawSubmissionData
  })
}

async function createOrgRegAccFixtures(db) {
  const organisationDocCount = await db
    .collection(COLLECTION_ORGANISATION)
    .countDocuments()

  if (organisationDocCount === 0) {
    logger.info({
      message: 'Create seed data: inserting org/reg/acc fixtures'
    })

    const { insertedIds } = await db
      .collection(COLLECTION_ORGANISATION)
      .insertMany([seedOrganisationRecord(organisationFixture)])

    await db.collection(COLLECTION_REGISTRATION).insertMany([
      registrationSubmission({
        referenceNumber: insertedIds[0]?.toString(),
        orgId: ORG_ID_START_NUMBER,
        answers: extractAnswers(registrationFixture),
        rawSubmissionData: registrationFixture
      })
    ])

    await db.collection(COLLECTION_ACCREDITATION).insertMany([
      accreditationSubmission({
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
