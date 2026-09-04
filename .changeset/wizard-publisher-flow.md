---
"@specify-sh/wizard": minor
---

Add `npx @specify-sh/wizard`, which adds the Specify publisher SDK to your
project using a coding agent you already have installed. It asks for no API
key of its own: your agent supplies the model and the authentication, and the
wizard supplies the prompt, the guardrails, and the API reference it fetches
from the docs as the run starts, so what it writes matches what is published
today.

The run detects your installed agents and asks which to use, warns before
starting if your working tree is dirty or outside Git, and takes your
publisher key, or a placeholder you can replace later. The agent then reads
your project and reports a plan: the framework and package manager it found,
where the shared client goes, which env file and variable to use, what it
found for consent and wallets, where the ads belong, and every file it would
create or modify. Nothing is written until you approve that plan. You can send
it back with feedback as often as you like, or stop, and when the changes are
made the wizard prints them for you to review. It never commits.
