import { ObjectId } from 'mongodb'

const SAMPLE_DATA = [
  {
    orgName: 'Wastemove Limited',
    region: 'ENGLAND',
    address: {
      lineOne: '51 Lower Gungate',
      lineTwo: '',
      townCity: 'Tamworth',
      county: 'Staffordshire',
      postcode: 'B79 7AS',
      gridRef: 'SK207042'
    }
  },
  {
    orgName: 'Rubbish Removals Limited',
    region: 'ENGLAND',
    address: {
      lineOne: '59 Nevern Square',
      lineTwo: '',
      townCity: 'Earls Court',
      county: 'London',
      postcode: 'SW5 9PN',
      gridRef: 'TQ252786'
    }
  },
  {
    orgName: 'Recycling4U Limited',
    region: 'SCOTLAND',
    address: {
      lineOne: '44-48 St James Centre',
      lineTwo: '',
      townCity: 'Edinburgh',
      county: 'Lothian',
      postcode: 'EH1 3SS',
      gridRef: 'NT258741'
    }
  },
  {
    orgName: 'Trash4Cash Limited',
    region: 'WALES',
    address: {
      lineOne: '349 Abergele Rd',
      lineTwo: '',
      townCity: 'Colwyn Bay',
      county: 'Clwyd',
      postcode: 'LL29 9PG',
      gridRef: 'SH867783'
    }
  },
  {
    orgName: 'Quick Removals',
    region: 'NORTHERN_IRELAND',
    address: {
      lineOne: '57 Ballyskeagh Rd',
      lineTwo: '',
      townCity: 'Lisburn',
      county: 'Antrim',
      postcode: 'BT27 5TE',
      gridRef: 'NW410228'
    }
  }
]

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function generateObjects() {
  const objects = []
  for (let i = 0; i < SAMPLE_DATA.length; i++) {
    objects.push({
      _id: new ObjectId(),
      orgId: randomInt(100000, 999999),
      schema_version: 1,
      region: SAMPLE_DATA[i].region,
      orgName: SAMPLE_DATA[i].orgName,
      address: SAMPLE_DATA[i].address,
      rawSubmissionData: {}
    })
  }
  return objects
}

const generatedObjects = generateObjects()
generatedObjects.forEach((obj, index) => {
  console.log(`Object ${index + 1}:`, JSON.stringify(obj, null, 2))
})
