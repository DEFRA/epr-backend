import {
  ACTIVITY,
  MATERIAL,
  REGION,
  TONNAGE_BAND
} from '../../common/enums/index.js'
import { addressFactory } from './address.js'
import { organisationFactory } from './organisation.js'
import { registrationFactory } from './registration.js'
import { accreditationFactory } from './accreditation.js'

export async function createSeedData(db) {
  const organisationDocCount = await db.collection('organisation').count()

  if (organisationDocCount === 0) {
    const addressBelfast = addressFactory({}, { usePreset: 'belfast' })
    const addressCardiff = addressFactory({}, { usePreset: 'cardiff' })
    const addressEdinburgh = addressFactory({}, { usePreset: 'edinburgh' })
    const addressBelfastWithGridRef = addressFactory(
      {},
      { useGridRef: true, usePreset: 'belfast' }
    )
    const addressCardiffWithGridRef = addressFactory(
      {},
      { useGridRef: true, usePreset: 'cardiff' }
    )
    const addressEdinburghWithGridRef = addressFactory(
      {},
      { useGridRef: true, usePreset: 'edinburgh' }
    )
    const addressLondonWithGridRef = addressFactory(
      {},
      { useGridRef: true, usePreset: 'london' }
    )

    const { insertedIds } = await db.collection('organisation').insertMany([
      organisationFactory('200001', {
        address: addressLondonWithGridRef
      }),
      organisationFactory('200002', {
        address: addressBelfastWithGridRef,
        region: REGION.NORTHERN_IRELAND
      }),
      organisationFactory('200003', {
        address: addressEdinburghWithGridRef,
        region: REGION.SCOTLAND
      }),
      organisationFactory('200004', {
        address: addressCardiffWithGridRef,
        region: REGION.WALES
      })
    ])

    await db.collection('registration').insertMany([
      registrationFactory('200001', insertedIds[0]),
      registrationFactory('200002', insertedIds[1], {
        address: addressBelfast,
        region: REGION.NORTHERN_IRELAND
      }),
      registrationFactory('200003', insertedIds[2], {
        address: addressEdinburgh,
        region: REGION.SCOTLAND,
        material: MATERIAL.FIBRE_BASED_COMPOSITE
      }),
      registrationFactory('200003', insertedIds[2], {
        address: addressEdinburgh,
        region: REGION.SCOTLAND,
        material: MATERIAL.WOOD
      }),
      registrationFactory('200004', insertedIds[3], {
        address: addressCardiff,
        region: REGION.WALES,
        material: MATERIAL.PLASTIC
      }),
      registrationFactory('200004', insertedIds[3], {
        address: addressCardiff,
        region: REGION.WALES,
        material: MATERIAL.PLASTIC,
        activity: ACTIVITY.EXPORTER
      })
    ])

    await db.collection('accreditation').insertMany([
      accreditationFactory('200001', insertedIds[0]),
      accreditationFactory('200002', insertedIds[1], {
        address: addressBelfast,
        region: REGION.NORTHERN_IRELAND
      }),
      accreditationFactory('200003', insertedIds[2], {
        address: addressEdinburgh,
        region: REGION.SCOTLAND,
        material: MATERIAL.FIBRE_BASED_COMPOSITE,
        tonnageBand: TONNAGE_BAND.GT500LTE5000
      }),
      accreditationFactory('200003', insertedIds[2], {
        address: addressEdinburgh,
        region: REGION.SCOTLAND,
        material: MATERIAL.WOOD,
        tonnageBand: TONNAGE_BAND.GT5000LTE10000
      }),
      accreditationFactory('200004', insertedIds[3], {
        address: addressCardiff,
        region: REGION.WALES,
        material: MATERIAL.PLASTIC,
        tonnageBand: TONNAGE_BAND.GTE10000
      }),
      accreditationFactory('200004', insertedIds[3], {
        address: addressCardiff,
        region: REGION.WALES,
        material: MATERIAL.PLASTIC,
        activity: ACTIVITY.EXPORTER,
        tonnageBand: TONNAGE_BAND.GTE10000
      })
    ])
  }
}
