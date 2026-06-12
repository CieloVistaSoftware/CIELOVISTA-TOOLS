# Issue Agent Dispatcher

This repository includes a scheduled GitHub Actions workflow at `.github/workflows/issue-agent-dispatcher.yml`.

## What it does

Every 5 minutes, the workflow:

1. Lists open GitHub issues in `CieloVistaSoftware/CIELOVISTA-TOOLS`.
2. Skips pull requests and issues that are already assigned.
3. Skips issues already marked with workflow/terminal labels such as:
   - `status:in-progress`
   - `agent:queued`
   - `status:blocked`
   - `status:done`
   - `duplicate`
   - `invalid`
   - `wontfix`
4. Selects at most one eligible issue per run.
5. Adds labels to prevent duplicate processing.
6. Leaves a comment showing the issue was claimed by automation.

## Labels used

The workflow will create these labels automatically if they do not already exist:

- `status:in-progress`
- `agent:queued`

## Why it does not directly start a Copilot coding agent session

As implemented here, the workflow is conservative and GitHub-native. It safely triages and claims work, but it does **not** directly launch a Copilot cloud coding agent session from GitHub Actions.

That limitation is intentional because this repository workflow currently has no supported, documented, repository-local action that can start the same interactive cloud agent flow used in the GitHub UI.

## How to extend it later

If GitHub adds a supported automation entrypoint for launching coding-agent tasks from Actions, or if this repository adopts an internal dispatch endpoint, the workflow can be extended after the claim step to:

- create a repository dispatch event,
- call an approved internal service,
- or trigger another workflow that integrates with your chosen agent system.

## Safety model

This workflow is designed to be safe for unattended execution:

- it only selects one issue per run,
- it skips already-assigned issues,
- it marks issues before further action,
- and it logs what it did in both Actions output and an issue comment.
