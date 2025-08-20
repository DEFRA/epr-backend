import deepmerge from 'deepmerge'

const addressBelfast = {
  lineOne: 'Northern Ireland Assembly',
  lineTwo: 'Parliament Buildings, Ballymiscaw, Stormont',
  townCity: 'Belfast',
  postcode: 'BT4 3XX'
}
const addressBelfastWithGridRef = {
  ...addressBelfast,
  gridRef: '54.60498 -5.83215'
}

const addressCardiff = {
  lineOne: 'Senedd',
  lineTwo: 'Pierhead St',
  townCity: 'Cardiff',
  postcode: 'CF99 1SN'
}
const addressCardiffWithGridRef = {
  ...addressCardiff,
  gridRef: '51.4645 -3.16134'
}

const addressEdinburgh = {
  lineOne: 'Holyrood',
  lineTwo: '',
  townCity: 'Edinburgh',
  postcode: 'EH99 1SP'
}
const addressEdinburghWithGridRef = {
  ...addressEdinburgh,
  gridRef: '55.95206 -3.17459'
}

const addressLondon = {
  lineOne: 'Palace of Westminster',
  lineTwo: '',
  townCity: 'London',
  postcode: 'SW1A 0AA'
}
const addressLondonWithGridRef = {
  ...addressLondon,
  gridRef: '51.49984 -0.12466'
}

export function addressFactory(
  partialAddress = {},
  { useGridRef = false, usePreset = 'london' } = {}
) {
  let defaultAddress = {}

  switch (usePreset) {
    case 'belfast':
      defaultAddress = useGridRef ? addressBelfastWithGridRef : addressBelfast
      break
    case 'cardiff':
      defaultAddress = useGridRef ? addressCardiffWithGridRef : addressCardiff
      break
    case 'edinburgh':
      defaultAddress = useGridRef
        ? addressEdinburghWithGridRef
        : addressEdinburgh
      break
    case 'london':
      defaultAddress = useGridRef ? addressLondonWithGridRef : addressLondon
      break
  }

  // @todo: add code coverage
  return deepmerge(defaultAddress, partialAddress /* c8 ignore next */ ?? {})
}
