# Priority Field Two-Way Sync Integration

This integration ensures that changes to the priority field in your Issue Viewer are reflected in your GitHub Project board, and vice versa.

## How It Works

- When you change the priority in the Issue Viewer, the integration updates the corresponding GitHub Project field using the GraphQL API.
- When the priority is changed in the Project board, your GitHub Action (see `docs/priority-sync.md`) updates the Issue Viewer’s field or label.

## Setup

1. Place the provided sync module in your Issue Viewer’s backend or extension code.
2. Configure a GitHub token with `repo` and `project` write permissions.
3. Wire the sync module to listen for priority changes in your Issue Viewer and call the sync function.
4. Ensure your GitHub Action is enabled for syncing changes from the Project board.

## Example Usage

```
import { syncPriorityToProject } from '../src/shared/priority-sync';

// When priority changes in Issue Viewer:
syncPriorityToProject(issueNumber, newPriority, githubToken);
```

## References
- [GitHub GraphQL API](https://docs.github.com/en/graphql)
- [GitHub Actions](https://docs.github.com/en/actions)
