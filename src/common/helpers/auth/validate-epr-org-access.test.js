import { describe, test, expect } from 'vitest'
import Boom from '@hapi/boom'

import { validateEprOrganisationAccess } from './validate-epr-org-access.js'

describe('#validateEprOrganisationAccess', () => {
  describe('discovery requests', () => {
    test('allows discovery request without organisationId', () => {
      const request = {
        route: {
          path: '/organisations',
          method: 'get'
        },
        method: 'get',
        params: {}
      }

      expect(() =>
        validateEprOrganisationAccess(request, undefined)
      ).not.toThrow()
    })

    test('allows discovery request with organisationId matching linkedEprOrg', () => {
      const request = {
        route: {
          path: '/organisations',
          method: 'get'
        },
        method: 'get',
        params: {
          organisationId: 'org-123'
        }
      }

      expect(() =>
        validateEprOrganisationAccess(request, 'org-123')
      ).not.toThrow()
    })

    test('throws forbidden when discovery request has mismatched organisationId', () => {
      const request = {
        route: {
          path: '/organisations',
          method: 'get'
        },
        method: 'get',
        params: {
          organisationId: 'org-123'
        }
      }

      expect(() => validateEprOrganisationAccess(request, 'org-456')).toThrow(
        Boom.forbidden('Access denied: organisation mismatch')
      )
    })
  })

  describe('organisation linking requests', () => {
    test('allows organisation linking request without organisationId', () => {
      const request = {
        route: {
          path: '/organisations/link',
          method: 'post'
        },
        method: 'post',
        params: {}
      }

      expect(() =>
        validateEprOrganisationAccess(request, undefined)
      ).not.toThrow()
    })

    test('allows organisation linking request with organisationId matching linkedEprOrg', () => {
      const request = {
        route: {
          path: '/organisations/link',
          method: 'post'
        },
        method: 'post',
        params: {
          organisationId: 'org-789'
        }
      }

      expect(() =>
        validateEprOrganisationAccess(request, 'org-789')
      ).not.toThrow()
    })

    test('throws forbidden when linking request has mismatched organisationId', () => {
      const request = {
        route: {
          path: '/organisations/link',
          method: 'post'
        },
        method: 'post',
        params: {
          organisationId: 'org-789'
        }
      }

      expect(() => validateEprOrganisationAccess(request, 'org-123')).toThrow(
        Boom.forbidden('Access denied: organisation mismatch')
      )
    })
  })

  describe('regular requests requiring organisationId', () => {
    test('throws forbidden when organisationId is missing', () => {
      const request = {
        route: {
          path: '/organisations/{organisationId}',
          method: 'get'
        },
        method: 'get',
        params: {}
      }

      expect(() => validateEprOrganisationAccess(request, 'org-123')).toThrow(
        Boom.forbidden('Organisation ID is required in the request')
      )
    })

    test('throws forbidden when organisationId is undefined', () => {
      const request = {
        route: {
          path: '/organisations/{organisationId}/summary',
          method: 'post'
        },
        method: 'post',
        params: {
          organisationId: undefined
        }
      }

      expect(() => validateEprOrganisationAccess(request, 'org-123')).toThrow(
        Boom.forbidden('Organisation ID is required in the request')
      )
    })

    test('allows request when organisationId matches linkedEprOrg', () => {
      const request = {
        route: {
          path: '/organisations/{organisationId}',
          method: 'get'
        },
        method: 'get',
        params: {
          organisationId: 'org-123'
        }
      }

      expect(() =>
        validateEprOrganisationAccess(request, 'org-123')
      ).not.toThrow()
    })

    test('throws forbidden when organisationId does not match linkedEprOrg', () => {
      const request = {
        route: {
          path: '/organisations/{organisationId}',
          method: 'get'
        },
        method: 'get',
        params: {
          organisationId: 'org-123'
        }
      }

      expect(() => validateEprOrganisationAccess(request, 'org-456')).toThrow(
        Boom.forbidden('Access denied: organisation mismatch')
      )
    })
  })

  describe('edge cases', () => {
    test('handles null linkedEprOrg with missing organisationId', () => {
      const request = {
        route: {
          path: '/organisations/{organisationId}/data',
          method: 'put'
        },
        method: 'put',
        params: {}
      }

      expect(() => validateEprOrganisationAccess(request, null)).toThrow(
        Boom.forbidden('Organisation ID is required in the request')
      )
    })

    test('handles null linkedEprOrg with organisationId', () => {
      const request = {
        route: {
          path: '/organisations/{organisationId}',
          method: 'get'
        },
        method: 'get',
        params: {
          organisationId: 'org-123'
        }
      }

      expect(() => validateEprOrganisationAccess(request, null)).toThrow(
        Boom.forbidden('Access denied: organisation mismatch')
      )
    })

    test('handles undefined linkedEprOrg with organisationId', () => {
      const request = {
        route: {
          path: '/organisations/{organisationId}',
          method: 'delete'
        },
        method: 'delete',
        params: {
          organisationId: 'org-123'
        }
      }

      expect(() => validateEprOrganisationAccess(request, undefined)).toThrow(
        Boom.forbidden('Access denied: organisation mismatch')
      )
    })

    test('handles empty string organisationId as missing', () => {
      const request = {
        route: {
          path: '/organisations/{organisationId}',
          method: 'get'
        },
        method: 'get',
        params: {
          organisationId: ''
        }
      }

      expect(() => validateEprOrganisationAccess(request, 'org-123')).toThrow(
        Boom.forbidden('Organisation ID is required in the request')
      )
    })

    test('handles empty string linkedEprOrg with organisationId', () => {
      const request = {
        route: {
          path: '/organisations/{organisationId}',
          method: 'get'
        },
        method: 'get',
        params: {
          organisationId: 'org-123'
        }
      }

      expect(() => validateEprOrganisationAccess(request, '')).toThrow(
        Boom.forbidden('Access denied: organisation mismatch')
      )
    })
  })

  describe('different HTTP methods', () => {
    test('validates GET request correctly', () => {
      const request = {
        route: {
          path: '/organisations/{organisationId}',
          method: 'get'
        },
        method: 'get',
        params: {
          organisationId: 'org-123'
        }
      }

      expect(() =>
        validateEprOrganisationAccess(request, 'org-123')
      ).not.toThrow()
    })

    test('validates POST request correctly', () => {
      const request = {
        route: {
          path: '/organisations/{organisationId}/submit',
          method: 'post'
        },
        method: 'post',
        params: {
          organisationId: 'org-123'
        }
      }

      expect(() =>
        validateEprOrganisationAccess(request, 'org-123')
      ).not.toThrow()
    })

    test('validates PUT request correctly', () => {
      const request = {
        route: {
          path: '/organisations/{organisationId}',
          method: 'put'
        },
        method: 'put',
        params: {
          organisationId: 'org-123'
        }
      }

      expect(() =>
        validateEprOrganisationAccess(request, 'org-123')
      ).not.toThrow()
    })

    test('validates DELETE request correctly', () => {
      const request = {
        route: {
          path: '/organisations/{organisationId}',
          method: 'delete'
        },
        method: 'delete',
        params: {
          organisationId: 'org-123'
        }
      }

      expect(() =>
        validateEprOrganisationAccess(request, 'org-123')
      ).not.toThrow()
    })
  })

  describe('case sensitivity', () => {
    test('is case-sensitive for organisationId matching', () => {
      const request = {
        route: {
          path: '/organisations/{organisationId}',
          method: 'get'
        },
        method: 'get',
        params: {
          organisationId: 'ORG-123'
        }
      }

      expect(() => validateEprOrganisationAccess(request, 'org-123')).toThrow(
        Boom.forbidden('Access denied: organisation mismatch')
      )
    })

    test('matches when casing is identical', () => {
      const request = {
        route: {
          path: '/organisations/{organisationId}',
          method: 'get'
        },
        method: 'get',
        params: {
          organisationId: 'ORG-123'
        }
      }

      expect(() =>
        validateEprOrganisationAccess(request, 'ORG-123')
      ).not.toThrow()
    })
  })
})
