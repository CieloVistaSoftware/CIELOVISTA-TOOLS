# CieloVista Code Suggestion Guidelines

## Rules for Code Suggestions

1. Always include the full file path in every suggestion.
2. Format suggestions as JSON objects with line numbers.
3. Be friendly, concise, and focus on readability.
4. Never show shell (sh) commands — use PowerShell or TypeScript.
5. Always include type annotations in TypeScript.
6. Point out potential bugs and anti-patterns.
7. **Preserve all code headers and comments**: Never remove or alter function/class headers, section comments, or documentation blocks unless the change is explicitly about updating them. When applying fixes, only modify the minimum code necessary to resolve the issue.
8. **Minimal diffs**: AI fixes should only change the lines directly related to the bug or issue. Avoid replacing or reformatting unrelated code.
9. **Review before apply**: Always show a clear diff and summary of what will change, highlighting any lines that are not strictly part of the fix.
10. **Explicit prompt for removals**: Only remove comments, headers, or documentation if the user prompt specifically requests it.
