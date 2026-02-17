# pEPR Backend

[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_epr-backend&metric=security_rating&token=26969f137977ed508a71e4ded70d645a6821f4ff)](https://sonarcloud.io/summary/new_code?id=DEFRA_epr-backend)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_epr-backend&metric=alert_status&token=26969f137977ed508a71e4ded70d645a6821f4ff)](https://sonarcloud.io/summary/new_code?id=DEFRA_epr-backend)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_epr-backend&metric=coverage&token=26969f137977ed508a71e4ded70d645a6821f4ff)](https://sonarcloud.io/summary/new_code?id=DEFRA_epr-backend)

Backend APIs for: Packaging Extended Producer Responsibilities

- [pEPR Backend](#pepr-backend)
  - [API endpoints](#api-endpoints)
  - [Docker](#docker)
    - [Running with Docker Compose](#running-with-docker-compose)
  - [Cognito](#cognito)
    - [Prerequisites](#prerequisites)
    - [Visual Studio Code](#visual-studio-code)
    - [Curl / other access](#curl--other-access)
      - [AWS Cognito](#aws-cognito)
      - [Cognito stub](#cognito-stub)
  - [Contributing](#contributing)
  - [Architecture](#architecture)
  - [Runbooks](#runbooks)
  - [Known issues](#known-issues)
  - [Workarounds](#workarounds)
  - [Licence](#licence)
    - [About the licence](#about-the-licence)

## API endpoints

Swagger documentation is available by running this application locally and navigating to `/swagger`. A static copy may also be found [here](https://github.com/DEFRA/epr-re-ex-service/blob/main/docs/architecture/api-definitions/internal-api.yaml).

_The application runs at `https://epr-backend.{env}.cdp-int.defra.cloud`, where `{env}` is one of `dev|test|prod`_

## Docker

### Running with Docker Compose

The project uses a shared compose file (`compose.shared.yml`) for all supporting services, which can be used by both backend and frontend repositories.

**Run supporting services only:**

```sh
docker compose -f compose.shared.yml up
```

Then run the backend locally with `npm run dev` in a separate terminal.

**Run backend + supporting services:**

```sh
docker compose up
```

**Run backend + frontend + supporting services:**

```sh
docker compose --profile all up
```

**Run with specific frontend version:**

```sh
FRONTEND_VERSION=1.2.3 docker compose --profile all up
```

**Include Defra ID stub (for frontend authentication):**

```sh
docker compose --profile stub up
```

**Supporting services included:**

- LocalStack (AWS service emulation)
- MongoDB (backend only)
- Redis (frontend + supporting services)
- nginx-proxy (frontend only)
- cdp-uploader (file upload service)
- cdp-defra-id-stub (authentication stub, `--profile stub`)

**Note:** Running the backend requires `GOVUK_NOTIFY_API_KEY` environment variable.

## Cognito

We have some [external endpoints](src/packaging-recycling-notes) that require Cognito auth

### Prerequisites

If you intend to use AWS Cognito you need to source the following from the environment you'll be targetting

- Cognito client secret
- [Developer API key](https://portal.cdp-int.defra.cloud/documentation/how-to/developer-api-key.md)

### Visual Studio Code

If you use VS Code you use [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) to make [requests](requests.http).

Add the following to [.vscode/settings.json](.vscode/settings.json) to enable
[environment switching](https://github.com/Huachao/vscode-restclient/blob/master/README.md#environments):

```json
{
  "rest-client.environmentVariables": {
    "local": {
      "baseUrl": "http://localhost:3001",
      "clientId": "5357lgchj0h0fuomqyas5r87u",
      "tokenUrl": "http://localhost:9229"
    },
    "dev": {
      "baseUrl": "https://ephemeral-protected.api.dev.cdp-int.defra.cloud/epr-backend",
      "clientId": "3c8h0trqsqhlfrp91u8uv6a80",
      "tokenUrl": "https://epr-backend-c63f2.auth.eu-west-2.amazoncognito.com"
    }
  }
}
```

### Curl / other access

You can also get tokens via curl, there's also a [Python example in the CDP docs](https://portal.cdp-int.defra.cloud/documentation/how-to/apis.md#get-a-cognito-token)

#### AWS Cognito

Get Cognito Token

```sh
CLIENT_SECRET=<client-secret-value>

curl --request POST \
  --url https://epr-backend-c63f2.auth.eu-west-2.amazoncognito.com/oauth2/token \
  --data grant_type=client_credentials \
  --data client_id=3c8h0trqsqhlfrp91u8uv6a80 \
  --data client_secret=${CLIENT_SECRET}
```

List Packaging Recycling Notes

```sh
TOKEN=<access_token value>
DEVELOPER_API_KEY=<developer-api-key-value>

curl --request GET \
  --url 'https://ephemeral-protected.api.dev.cdp-int.defra.cloud/epr-backend/v1/packaging-recycling-notes?statuses=awaiting_acceptance' \
  --header "authorization: Bearer ${TOKEN}" \
  --header "x-api-key: ${DEVELOPER_API_KEY}"
```

#### Cognito stub

Get Cognito Token

```sh
curl --request POST \
  --url http://localhost:9229/ \
  --header 'content-type: application/x-amz-json-1.1' \
  --header 'x-amz-target: AWSCognitoIdentityProviderService.InitiateAuth' \
  --data '{"AuthFlow": "USER_PASSWORD_AUTH","ClientId": "5357lgchj0h0fuomqyas5r87u","AuthParameters": {"USERNAME": "hello@example.com","PASSWORD": "testPassword"}}'
```

List Packaging Recycling Notes

```sh
TOKEN=<AuthenticationResult.AccessToken value>

curl --request GET \
  --url 'http://localhost:3001/v1/packaging-recycling-notes?statuses=awaiting_acceptance' \
  --header "authorization: Bearer ${TOKEN}" \
  --header 'user-agent: vscode-restclient'
```

## Contributing

If you intend to contribute to this repository and/or run the application locally, please [see the contributing guidance](./CONTRIBUTING.md).

## Architecture

You can find more information about [the project's architecture here](https://github.com/DEFRA/epr-re-ex-service/tree/main/docs/architecture/index.md),
also see the [Architecture Decision Records](https://github.com/DEFRA/epr-re-ex-service/tree/main/docs/architecture/decisions/index.md).

## Runbooks

You can find [this service's runbooks here](https://eaflood.atlassian.net/wiki/spaces/MWR/pages/5873762458/Runbooks).

## Known issues

None

## Workarounds

None

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government licence v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable
information providers in the public sector to license the use and re-use of their information under a common open
licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
