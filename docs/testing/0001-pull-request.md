# What happens during each Pull Request

As part of the Pull Request process, a Journey Test action is executed. These tests are referenced to the Journey test repository.

`docker build` is first run against the `epr-backend` repository which builds a Docker image against the latest Git SHA commit in the Pull Request.

`docker compose` is then executed and the journey tests (end to end) are run against the Docker containers (Including epr-backend image with the Git SHA reference).

At the end of the journey tests, an Allure report is generated and the Docker Compose logs are attached in the Actions run itself.

The logs can be useful for troubleshooting an actual issue, for example if the `epr-backend` application fails to start up over an error or there was an unknown issue.
