# 9. Use Renovate for Dependency Updates

Date: 2025-10-01

## Status

Accepted

## Context

Managing dependencies across the project requires regular updates to address
security vulnerabilities, bug fixes, and new features. Manual dependency updates
are time-consuming, error-prone, and often neglected until critical security
issues arise.

We need an automated solution that:

- Regularly checks for dependency updates
- Creates pull requests with clear changelogs
- Allows granular control over update scheduling and grouping
- Integrates with our CI/CD pipeline for automated testing

## Decision

We will use [Renovate](https://docs.renovatebot.com/) to automate dependency updates across the project.

Renovate will:

- Scan package.json and other files for outdated dependencies
- Create pull requests for updates with detailed release notes
- Group related updates where appropriate
- Schedule updates to avoid disruption during critical periods
- Respect semantic versioning for major/minor/patch updates

## Consequences

**Positive:**

- Dependencies stay current with minimal manual intervention
- Security vulnerabilities are identified and addressed quickly
- Each update is tested via CI/CD before merging
- Clear audit trail of dependency changes via pull requests
- Reduced technical debt from outdated dependencies

**Negative:**

- Additional notification noise for pull requests
- Requires initial configuration and ongoing tuning of update policies
