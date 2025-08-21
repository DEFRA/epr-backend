import { organisationFactory } from './organisation.js'
import { registrationFactory } from './registration.js'
import { accreditationFactory } from './accreditation.js'

import { extractAnswers } from '../../common/helpers/apply/extract-answers.js'

import organisationFixture from '../fixtures/organisation.json' with { type: 'json' }
import registrationFixture from '../fixtures/registration.json' with { type: 'json' }
import accreditationFixture from '../fixtures/accreditation.json' with { type: 'json' }

export async function createSeedData(db) {
  const organisationDocCount = await db.collection('organisation').count()

  if (organisationDocCount === 0) {
    const { insertedIds } = await db.collection('organisation').insertMany([
      organisationFactory(200001, {
        answers: extractAnswers(organisationFixture),
        rawSubmissionData: organisationFixture
      })
    ])

    await db.collection('registration').insertMany([
      registrationFactory(200001, insertedIds[0]?.toString(), {
        answers: extractAnswers(registrationFixture),
        rawSubmissionData: registrationFixture
      })
    ])

    await db.collection('accreditation').insertMany([
      accreditationFactory(200001, insertedIds[0]?.toString(), {
        answers: extractAnswers(accreditationFixture),
        rawSubmissionData: accreditationFixture
      })
    ])
  }
}
