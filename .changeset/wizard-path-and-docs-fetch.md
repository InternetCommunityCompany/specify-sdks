---
"@specify-sh/wizard": patch
---

Show the project path correctly when its directory name starts with your home directory's. With the home directory `/home/dev`, a project in `/home/dev2/app` was shown as `~2/app`.

Ctrl-C now stops the wizard while it loads the Specify documentation, and a stalled connection gives up after 30 seconds instead of holding the wizard for up to five minutes.
