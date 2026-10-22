import { USER_ROLES } from '#domain/organisations/model.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import { beforeEach, describe, expect } from 'vitest'

/** @import { CollatedUser } from '#domain/organisations/model.js' */
/** @import { OrganisationBuilders } from './test-data.js' */
/** @import { OrganisationsRepository, OrganisationsRepositoryFactory } from '../port.js' */

const versionConflict = (version, currentVersion) => ({
  isBoom: true,
  output: {
    statusCode: 409,
    payload: {
      message: `Version conflict: attempted to update with version ${version} but current version is ${currentVersion}`
    }
  }
})

const notFound = { isBoom: true, output: { statusCode: 404 } }

/** @param {{ orgId: number }} organisation */
const numberOf = ({ orgId }) => toOrganisationNumber(String(orgId))

/** @type {CollatedUser} */
const aUser = {
  contactId: 'contact-123',
  email: 'new.user@example.com',
  fullName: 'New User',
  roles: [USER_ROLES.STANDARD]
}

export const testReplaceUsersBehaviour = (it) => {
  describe('replacing users', () => {
    /** @type {OrganisationsRepository} */
    let repository
    /** @type {OrganisationBuilders['buildOrganisation']} */
    let buildOrganisation

    beforeEach(
      async (
        /** @type {{ organisationsRepository: OrganisationsRepositoryFactory, organisationBuilders: OrganisationBuilders }} */ {
          organisationsRepository,
          organisationBuilders
        }
      ) => {
        repository = await organisationsRepository()
        buildOrganisation = organisationBuilders.buildOrganisation
      }
    )

    const insertOrg = async () => {
      const org = buildOrganisation()
      await repository.insert(org)
      return repository.findById(org.id, 1)
    }

    describe('replaceUsers', () => {
      it('stores the users before those the records name', async () => {
        const org = await insertOrg()

        await repository.replaceUsers(numberOf(org), 1, [aUser])

        const { users } = await repository.findById(org.id, 2)
        expect(users[0]).toEqual(aUser)
        expect(users.map(({ email }) => email)).toContain(
          org.submitterContactDetails.email
        )
      })

      it('changes nothing else on the organisation', async () => {
        const org = await insertOrg()

        await repository.replaceUsers(numberOf(org), 1, [aUser])

        const {
          users: _users,
          version,
          ...rest
        } = await repository.findById(org.id, 2)
        const { users: _u, version: before, ...restBefore } = org
        expect(version).toBe(before + 1)
        expect(rest).toEqual(restBefore)
      })

      it('removes a user the records do not name', async () => {
        const org = await insertOrg()
        await repository.replaceUsers(numberOf(org), 1, [aUser])

        await repository.replaceUsers(numberOf(org), 2, [])

        const { users } = await repository.findById(org.id, 3)
        expect(users.map(({ email }) => email)).not.toContain(aUser.email)
      })

      it('rejects an invalid user', async () => {
        const org = await insertOrg()

        await expect(
          repository.replaceUsers(numberOf(org), 1, [
            { ...aUser, email: 'not-an-email' }
          ])
        ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 422 } })
      })

      it('rejects a stale version and leaves the users', async () => {
        const org = await insertOrg()
        await repository.replaceUsers(numberOf(org), 1, [aUser])
        await repository.findById(org.id, 2)

        await expect(
          repository.replaceUsers(numberOf(org), 1, [])
        ).rejects.toMatchObject(versionConflict(1, 2))

        const unchanged = await repository.findById(org.id)
        expect(unchanged.version).toBe(2)
        expect(unchanged.users[0]).toEqual(aUser)
      })

      it('rejects an organisation that does not exist', async () => {
        await expect(
          repository.replaceUsers(numberOf(buildOrganisation()), 1, [aUser])
        ).rejects.toMatchObject(notFound)
      })
    })
  })
}
