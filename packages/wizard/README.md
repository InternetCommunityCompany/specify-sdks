# @specify-sh/wizard

Adds the Specify publisher SDK to your project, using a coding agent you already have installed.

```sh
npx @specify-sh/wizard
```

The wizard runs no model of its own and never asks for an API key or a secret. Your coding agent supplies the model and the authentication. The wizard supplies the goal and the index of the Specify documentation, which it fetches as the run starts, so the agent reads the pages that are published today.

## What happens

1. It finds the coding agents installed on your machine and asks which to use, then says what it is about to do and where.
2. It warns you first if your working tree is dirty or is not a Git repository, because the agent is about to edit files.
3. The agent reads your project and whichever documentation it decides it needs. You watch it work: the files it reads, the commands it runs, the files it writes.
4. It reports a plan — what it found, what it would change, and where ads could go. The plan is shown as rendered markdown; Page Up and Page Down scroll it.
5. You approve the plan, send it back with feedback, or stop. Nothing is written until you approve.
6. You choose which of the suggested placements it should build.
7. The agent makes the changes, and the wizard prints what changed for you to review. It never commits.

Your code goes to your coding agent's own model provider. It does not go to Specify.

## Your publisher key

The wizard never asks for your key, so it never handles one. The agent writes `spk_your_key_here` into your env file instead, and the wizard tells you which file that is when it finishes. Replace it with a key from [your publisher keys](https://app.specify.sh/publish/publisher-keys).

## Options

| Flag | What it does |
| --- | --- |
| `--publisher` | Add the publisher SDK. The default. |
| `--advertiser` | Not available yet. |
| `--verbose` | Name the underlying cause when something fails. |
| `--version` | Print the version. |
| `--help` | Print usage. |

## Agents

Whichever of these is on your `PATH`: Claude Code, Codex, Cursor, Gemini CLI, opencode, Goose, Cline, Kilo Code, Antigravity, pi. Detection comes from [AnyAgent](https://www.npmjs.com/package/anyagent-js).

**[Manual setup guide →](https://docs.specify.sh/publishing/get-started)**

MIT © The Internet Community Company
