# Priority Field Two-Way Sync

This workflow keeps the GitHub Project board priority field and issue labels in sync.

## How It Works

- When you change the priority label on an issue, the workflow updates the corresponding project field.
- When you change the priority field in the project board, the workflow updates the issue label.

## Setup

1. The workflow is defined in `.github/workflows/sync-priority.yml`.
2. It uses GitHub Actions and the GitHub GraphQL API.
3. You may need to add a `GH_TOKEN` secret with repo and project write permissions.

## Limitations

- The included workflow is a scaffold. You must implement the sync logic using the GitHub GraphQL API.
- For full two-way sync, you may need a scheduled job or a bot that listens for project field changes (not just label events).

## References
- [GitHub Projects API](https://docs.github.com/en/graphql/reference/objects#projectv2)
- [GitHub Actions](https://docs.github.com/en/actions)
