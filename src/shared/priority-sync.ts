// priority-sync.ts
// Placeholder for two-way sync between Issue Viewer and GitHub Project priority field
// Requires a GitHub token with repo and project write permissions


export async function syncPriorityToProject(issueNumber: number, priority: number, githubToken: string) {
  // TODO: Implement GraphQL mutation to update project field
  // See docs/priority-sync-integration.md for details
  console.log(`Syncing priority for issue #${issueNumber} to ${priority}`);
  // Example GraphQL mutation (to be implemented):
  // const query = `mutation { ... }`;
  // await fetch('https://api.github.com/graphql', { ... });
}

export async function syncPriorityFromProject(issueNumber: number, githubToken: string) {
  // TODO: Implement GraphQL query to read project field and update Issue Viewer
  console.log(`Syncing priority from project for issue #${issueNumber}`);
  // Example GraphQL query (to be implemented):
  // const query = `{ ... }`;
  // await fetch('https://api.github.com/graphql', { ... });
}
