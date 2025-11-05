entraOrDefraJwtOptions({
  defra: {
    audience: config.get('oidc.defraId.clientId'),
    jwksUri: defraIdWellKnownDetails.jwks_uri,
    issuer: defraIdWellKnownDetails.issuer
  },
  entra: {
    audience: config.get('oidc.azureAD.clientId'),
    jwksUri: entraWellKnownDetails.jwks_uri,
    issuer: entraWellKnownDetails.issuer
  }
})
