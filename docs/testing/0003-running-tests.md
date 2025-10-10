# Running the journey tests (locally)

Ensure that the `epr-backend-journey-tests` repository is cloned locally

In the repository folder, run the following command:

```
docker compose up -d
```

Wait for 5 to 10 seconds after all containers are started to allow for containers such as ZAP to start.

Then run

```
npm run test
```

More detailed instructions can be found in the [README.md](https://github.com/DEFRA/epr-backend-journey-tests/blob/main/README.md) of the `epr-backend-journey-tests` repository

## Stale epr-backend Docker container

When you are running tests locally, you may occasionally get an outdated `epr-backend` container due to how Docker caches images.

To always ensure that your `epr-backend` container is up to date, run the following command:

```
docker rmi $(docker images | grep epr-backend | grep latest | awk '{print $3}')
```

This will remove all `epr-backend` images that are tagged as `latest`.

After that, you can re-run Docker Compose and the tests.

## Running tests against a specific branch

Sometimes your branch build on `epr-backend` will fail due to a change in the `epr-backend` code and you expected the failure.

You would want to run your tests locally against the branch that you expect to fail before committing your changes.

Run this in the `epr-backend` (Not journey tests!) repository:

```
docker build -t defradigital/epr-backend:<GIT_COMMIT_SHA> .
```

Where `<GIT_COMMIT_SHA>` is your latest commit in the branch.

After that, you can run the journey tests against the branch you expect to fail by running (This time in the journey tests repository):

```
EPR_BACKEND=<GIT_COMMIT_SHA> docker compose up -d
npm run test
```
