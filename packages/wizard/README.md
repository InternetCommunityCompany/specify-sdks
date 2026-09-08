# @specify-sh/wizard

Adds the Specify publisher SDK to your project, using a coding agent you already have installed.

```sh
npx @specify-sh/wizard
```

The wizard runs no model of its own and never asks for an API key. Your coding agent supplies the model and the authentication. The wizard supplies the goal and the index of the Specify documentation, which it fetches as the run starts, so the agent reads the pages that are published today.

## What happens

1. It finds the coding agents installed on your machine and asks which to use.
2. It warns you first if your working tree is dirty or is not a Git repository, because the agent is about to edit files.
3. It asks for your [publisher key](https://app.specify.sh/publish/publisher-keys). Skip it and you get a placeholder to replace later.
4. The agent reads your project, reads whichever documentation it decides it needs, and reports a plan: what it found, what it would change, and where ads could go.
5. You choose which of the suggested placements it should build.
6. You approve the plan, send it back with feedback, or stop. Nothing is written until you approve.
7. The agent makes the changes, and the wizard prints them for you to review. It never commits.

## Agents

Whichever of these is on your `PATH`: Claude Code, Codex, Cursor, Gemini CLI, opencode, Goose, Cline, Kilo Code, Antigravity, pi. Detection comes from [AnyAgent](https://www.npmjs.com/package/anyagent-js).

**[Manual setup guide →](https://docs.specify.sh/publishing/get-started)**

MIT © The Internet Community Company
