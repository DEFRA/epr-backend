# 4. data-extraction

Date: 2025-09-03

## Status

Proposed

## Context

As a support team, we need some visibility of the data is being added to our database EPR system in order to debug potential data issues that haven't been pre-empted or captured in our tests.

Direct access to the database in the production enviroment is not available to our team, since the CDP terminal does not provide such access. This is "by design", inline with best industry practices.

We need an approach for our team to extract only the necessary data that takes privacy and security into consideration, but which also gives our team the flexibility to obtain all the necessary information to support the service.

Requesting data dump from other teams is not sustainable and it doesn't cater to our needs since it would give us too much information, including PII, which we must avoid.

## Decision

We have considered placing all the data extraction functionality into a separate repository to the `epr-backend` versus collocating it in the `epr-backend`.

Given our time constraints and the fact that there is overhead in setting up and maintaining another repo and a separate service, we have decided to leverage the `epr-backend` code infrastructure by adding one or more protected endpoints dedicated to meeting our data extraction needs.

In order to follow Data Minisation and Least Privilege best practices, we have also decided the following approach:

- Only extract the fields/keys that are necessary for our current debugging goals
- Limit the number of documents extracted in any request by requiring a "sinceDate" parameter that will discourage the retrieval of excessive amounts of data in a single operation. A "fromDate" may also be added as an optional parameter.
- Return in masked form any fields that are likely to contain PII (including all form answers) by default and explicitly define which ones can be returned in clear form through an allow list.

We have also decided to include a "count" field reporting the number of documents returned as part of the metadata mandatory in each of these new GET endpoints.

## Consequences

Separation between form processing endpoints and data extraction ones would give us better flexibility, while keeping the `epr-backend` focused on servicing our users. However, the proposed tactical architecture doesn't prevent us from separating the two functions into separate service in the future.
