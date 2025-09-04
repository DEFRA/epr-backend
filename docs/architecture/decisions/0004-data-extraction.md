# 4. Data Extraction

Date: 2025-09-03

## Status

Accepted

## Context

As a support team, we need some visibility of the data is being added to our database EPR system in order to debug potential data issues that haven't been pre-empted or captured in our tests.

Direct access to the database in the production environment is not available to our team, since the CDP terminal does not provide such access. This is "by design", inline with best industry practices.

We need an approach for our team to extract only the necessary data that takes privacy and security into consideration, but which also gives our team the flexibility to obtain all the necessary information to support the service.

Requesting a data dump from other teams is not sustainable, and it doesn't cater to our needs since it would give us too much information, including PII, which we must avoid.

## Decision

### Location of Endpoints

We have considered placing all the data extraction functionality into a separate repository from the `epr-backend` versus collocating it in the `epr-backend`.

Given our time constraints and the fact that there is overhead in setting up and maintaining another repo and a separate service, we have decided to leverage the `epr-backend` code infrastructure by adding one or more protected endpoints dedicated to meeting our data extraction needs.

### Privacy

In order to follow Data Minimisation and Least Privilege best practices, we have also decided on the following approach:

- Only retrieve `answers` not `rawSubmissionData`.
- Limit the number of documents extracted in any request by requiring a `fromDate` parameter that will discourage the retrieval of excessive amounts of data in a single operation. A `toDate` may also be added as an optional parameter.
- Allow (eventually) retrieval by `referenceNumber` or by `orgId`
- Return all answers in masked form by default and explicitly define which ones can be returned in clear form through an allow list.

### Safety

The endpoints must be protected with basic HTTP authentication (HTTPS only).

### Agreed

As a way to alleviate our most immediate needs, we have decided to add with the endpoint that would give us the most visibility on what happens with our organisation applications.

A new `GET /v1/apply/report` endpoint is added which provides retrieves 3 document collections from our database: `organisations`, `registrations` and `accreditations`.

The endpoint is protected by basic authentication. Where to keep the authentication credentials is to be defined during the implementation phase.

The response omits the `rawSubmissionData`.

The response initially masks all `answers` and `email` but all other fields `referenceNumber`, `orgId` and `orgName` are sent in clear form.

The endpoint requires a `fromDate` query parameter and supports an optional `toDate` parameter. These parameters are used to filter the documents to be retrieved by their creation date. These parameters must follow the ISO 8601 date-time format. If the number of records matching the filtering criteria exceeds a limit (to be defined), the endpoint should returns a `413 Payload Too Large` error; otherwise, it returns an array of `organisation` records in the order of their creation date.

The response includes a `metadata` field which itself includes a `count` field reporting the number of organisation records returned.

The resulting response's payload should look something like this:

```json
{
  "data": {
    "organisations": {
      "count": 3,
      "items": []
    },
    "registrations": {
      "count": 3,
      "items": []
    },
    "accreditations": {
      "count": 3,
      "items": []
    }
  }
}
```

## Consequences

Separation between form processing endpoints and data extraction ones might give us better flexibility, while keeping the `epr-backend` focused on servicing our users. However, that approach is incompatible with [CDP's core principles](https://portal.cdp-int.defra.cloud/documentation/onboarding/onboarding-considerations.md#microservices) which states:

> A single database cannot be natively accessed by more than 1 microservice. Data exchange must be via the owning microservices through the use of APIs, messages etc.
