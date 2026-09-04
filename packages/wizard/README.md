# @specify-sh/wizard

Adds the Specify publisher SDK to your project, using a coding agent you already have installed.

```sh
npx @specify-sh/wizard
```

The wizard runs no model of its own and never asks for an API key. Your coding agent supplies the model and the authentication. The wizard supplies the prompt, the guardrails, and the API reference it fetches from the docs as the run starts, so what the agent writes matches what is published today.

## What happens

1. It finds the coding agents installed on your machine and asks which to use.
2. It warns you first if your working tree is dirty or is not a Git repository, because the agent is about to edit files.
3. It asks for your [publisher key](https://app.specify.sh/publish/publisher-keys). Skip it and you get a placeholder to replace later.
4. The agent reads your project and reports a plan: the framework and package manager it found, where the shared client goes, which env file and variable to use, what it found for consent and wallets, where the ads belong, and every file it would create or modify.
5. You approve the plan, send it back with feedback, or stop. Nothing is written until you approve.
6. The agent makes the changes, and the wizard prints them for you to review. It never commits.

## Agents

Whichever of these is on your `PATH`: Claude Code, Codex, Cursor, Gemini CLI, opencode, Goose, Cline, Kilo Code, Antigravity, pi. Detection comes from [AnyAgent](https://www.npmjs.com/package/anyagent-js).

**[Manual setup guide →](https://docs.specify.sh/publishing/get-started)**

MIT © The Internet Community Company
