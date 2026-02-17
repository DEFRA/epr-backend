# pEPR Backend

[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_epr-backend&metric=security_rating&token=26969f137977ed508a71e4ded70d645a6821f4ff)](https://sonarcloud.io/summary/new_code?id=DEFRA_epr-backend)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_epr-backend&metric=alert_status&token=26969f137977ed508a71e4ded70d645a6821f4ff)](https://sonarcloud.io/summary/new_code?id=DEFRA_epr-backend)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_epr-backend&metric=coverage&token=26969f137977ed508a71e4ded70d645a6821f4ff)](https://sonarcloud.io/summary/new_code?id=DEFRA_epr-backend)

Backend APIs for: Packaging Extended Producer Responsibilities

<!-- prettier-ignore-start -->
<!-- TOC -->

- [pEPR Backend](#pepr-backend)
  - [API endpoints](#api-endpoints)
  - [Docker](#docker)
    - [Running with Docker Compose](#running-with-docker-compose)
  - [Contributing](#contributing)
  - [Architecture](#architecture)
  - [Runbooks](#runbooks)
  - [Known issues](#known-issues)
  - [Workarounds](#workarounds)
  - [Licence](#licence)
    - [About the licence](#about-the-licence)

<!-- TOC -->
<!-- prettier-ignore-end -->

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
