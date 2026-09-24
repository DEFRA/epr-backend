import { WORKSHEET_NAME } from '#market-insights/domain/published-workbook-text.js'
import { addKey } from './key-tab.js'
import {
  itMatchesThePublishedTab,
  renderTab
} from './published-workbook-test-helpers.js'

describe('the Key tab', () => {
  itMatchesThePublishedTab(WORKSHEET_NAME.KEY, () => renderTab(addKey))
})
