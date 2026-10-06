import {
  buildLinkedDefraOrg,
  buildOrganisation
} from '#repositories/organisations/contract/test-data.js'
import {
  ACCREDITATION_NUMBER,
  EXPORTER_ACCREDITATION_NUMBER,
  EXPORTER_NUMBER,
  REPROCESSOR_NUMBER,
  accreditation,
  anakin,
  approvedOverseasSite,
  exporter,
  exporterAccreditation,
  findOrganisation,
  grantedTimeline,
  luke,
  overseasSites,
  pendingOverseasSite,
  reprocessor,
  reprocessorAt,
  yoda
} from './organisation-read-test-helpers.js'

/** @import { OrganisationReadRepositoryContractIt } from '../port.contract.js' */

/**
 * @param {OrganisationReadRepositoryContractIt} it
 */
export const testFindByOrganisationNumberBehaviour = (it) => {
  describe('findByOrganisationNumber', () => {
    const today = () => new Date().toISOString().slice(0, 10)

    it('returns null for an unknown organisation number', async ({
      organisationReadRepositoryWith
    }) => {
      const repository = await organisationReadRepositoryWith({
        organisations: [buildOrganisation({ orgId: 500001 })]
      })

      expect(await repository.findByOrganisationNumber(500002)).toBeNull()
    })

    it('returns the organisation with granted registrations keyed by number and accreditations by year', async ({
      organisationReadRepositoryWith
    }) => {
      const granted2026 = accreditation()
      const stored = buildOrganisation({
        registrations: [reprocessor({ accreditationId: granted2026.id })],
        accreditations: [granted2026]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(repository, stored.orgId)

      expect(organisation).toEqual({
        organisationNumber: stored.orgId,
        name: 'ACME ltd',
        tradingName: 'ACME ltd',
        companiesHouseNumber: 'AC012345',
        registeredAddress: {
          line1: 'Palace of Westminster',
          town: 'London',
          postcode: 'SW1A 0AA'
        },
        status: 'created',
        statusTimeline: { [today()]: { status: 'created' } },
        submittedToRegulator: { code: 'ea' },
        submitterContactDetails: anakin,
        users: [],
        version: stored.version,
        registrations: {
          [REPROCESSOR_NUMBER]: {
            applicationContactDetails: luke,
            approvedPersons: [luke],
            status: 'approved',
            statusTimeline: grantedTimeline('approved'),
            submitterContactDetails: luke,
            validFrom: '2026-02-01',
            material: 'glass_re_melt',
            submittedToRegulator: { code: 'ea' },
            wasteProcessingType: 'reprocessor',
            reprocessingType: 'input',
            site: {
              address: {
                line1: '7 Glass processing site',
                town: 'London',
                postcode: 'SW2A 0AA'
              }
            },
            accreditations: {
              2026: {
                accreditationNumber: ACCREDITATION_NUMBER,
                prnIssuance: { signatories: [yoda], tonnageBand: 'over_10000' },
                status: 'approved',
                statusTimeline: grantedTimeline('approved'),
                submitterContactDetails: yoda
              }
            }
          }
        }
      })
    })

    it('gives an exporter the details of every overseas site it uses, and no site or reprocessing type', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({ registrations: [exporter()] })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored],
        overseasSites
      })

      const organisation = await findOrganisation(repository, stored.orgId)

      expect(organisation.registrations[EXPORTER_NUMBER]).toEqual({
        applicationContactDetails: anakin,
        approvedPersons: [anakin],
        status: 'approved',
        statusTimeline: grantedTimeline('approved'),
        submitterContactDetails: anakin,
        validFrom: '2026-02-01',
        material: 'plastic',
        submittedToRegulator: { code: 'ea' },
        wasteProcessingType: 'exporter',
        overseasSites: {
          '001': approvedOverseasSite,
          '002': pendingOverseasSite
        },
        accreditations: {}
      })
    })

    it("records on an exporter's accreditation whether each overseas site is approved", async ({
      organisationReadRepositoryWith
    }) => {
      const accredited = exporterAccreditation()
      const stored = buildOrganisation({
        registrations: [exporter({ accreditationId: accredited.id })],
        accreditations: [accredited]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored],
        overseasSites
      })

      const organisation = await findOrganisation(repository, stored.orgId)

      expect(
        organisation.registrations[EXPORTER_NUMBER].accreditations[2026]
      ).toMatchObject({
        accreditationNumber: EXPORTER_ACCREDITATION_NUMBER,
        overseasSites: {
          '001': { status: 'approved', approvedOn: '2026-01-01' },
          '002': { status: 'pending' }
        }
      })
    })

    it('keys an accreditation by the year of its validFrom', async ({
      organisationReadRepositoryWith
    }) => {
      const granted2027 = accreditation({
        validFrom: '2027-01-01',
        validTo: '2027-12-31'
      })
      const stored = buildOrganisation({
        registrations: [reprocessor({ accreditationId: granted2027.id })],
        accreditations: [granted2027]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(repository, stored.orgId)

      expect(
        Object.keys(
          organisation.registrations[REPROCESSOR_NUMBER].accreditations
        )
      ).toEqual(['2027'])
    })

    it('gives the site address as submitted when ingest could not find its town, with its country and region', async ({
      organisationReadRepositoryWith
    }) => {
      const fullAddress =
        '7 Glass site, Unit 4, Industrial Estate, London, SW2A 0AA'
      const stored = buildOrganisation({
        registrations: [
          reprocessorAt({
            line1: '7 Glass site',
            postcode: 'SW2A 0AA',
            fullAddress,
            country: 'UK',
            region: 'London'
          })
        ]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(repository, stored.orgId)

      expect(organisation.registrations[REPROCESSOR_NUMBER]).toHaveProperty(
        'site',
        { address: { fullAddress, country: 'UK', region: 'London' } }
      )
    })

    it('gives an exporter with no overseas sites an empty map', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        registrations: [exporter({ overseasSites: undefined })]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(repository, stored.orgId)

      expect(organisation.registrations[EXPORTER_NUMBER]).toHaveProperty(
        'overseasSites',
        {}
      )
    })

    it('leaves out the trading name, companies house number and registered address when the organisation has none', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        registrations: [reprocessor()],
        companyDetails: { name: 'ACME ltd' }
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(repository, stored.orgId)

      expect(organisation).not.toHaveProperty('tradingName')
      expect(organisation).not.toHaveProperty('companiesHouseNumber')
      expect(organisation).not.toHaveProperty('registeredAddress')
    })

    it("lists the organisation's users with their roles", async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        registrations: [reprocessor()],
        users: [
          {
            contactId: 'contact-1',
            email: 'han@example.com',
            fullName: 'Han Solo',
            roles: ['initial_user']
          },
          {
            email: 'leia@example.com',
            fullName: 'Leia Organa',
            roles: ['standard_user']
          }
        ]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(repository, stored.orgId)

      expect(organisation.users).toEqual([
        {
          contactId: 'contact-1',
          email: 'han@example.com',
          roles: ['initial_user']
        },
        { email: 'leia@example.com', roles: ['standard_user'] }
      ])
    })

    it('groups the linked Defra ID organisation apart from who linked it and when', async ({
      organisationReadRepositoryWith
    }) => {
      const linked = buildLinkedDefraOrg('defra-org-1', 'Defra Org')
      const stored = buildOrganisation({
        registrations: [reprocessor()],
        linkedDefraOrganisation: linked
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(repository, stored.orgId)

      expect(organisation.linkedDefraOrganisation).toEqual({
        defraOrganisation: { id: 'defra-org-1', name: 'Defra Org' },
        linkedAt: linked.linkedAt,
        linkedBy: linked.linkedBy
      })
    })

    it('leaves out a contact phone number that was never given', async ({
      organisationReadRepositoryWith
    }) => {
      const { phone: _phone, ...withoutPhone } = luke
      const stored = buildOrganisation({
        registrations: [
          reprocessor({ applicationContactDetails: withoutPhone })
        ]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(repository, stored.orgId)

      expect(
        organisation.registrations[REPROCESSOR_NUMBER].applicationContactDetails
      ).toEqual(withoutPhone)
    })
  })
}
