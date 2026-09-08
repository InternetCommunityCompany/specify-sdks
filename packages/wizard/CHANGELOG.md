# @specify-sh/wizard

## 0.1.0

### Minor Changes

- d5243e8: Add `npx @specify-sh/wizard`, which adds the Specify publisher SDK to your
  project using a coding agent you already have installed. It asks for no API
  key of its own: your agent supplies the model and the authentication, and the
  wizard supplies the goal and the index of the Specify documentation, which it
  fetches as the run starts so the agent reads the pages that are published
  today rather than what it remembers.
  
  The run detects your installed agents and asks which to use, warns before
  starting if your working tree is dirty or outside Git, and takes your
  publisher key, or a placeholder you can replace later. The agent then reads
  your project, reads whichever documentation it decides it needs, and reports
  a plan in markdown: what it found, what it would change, and where ads could
  go. You choose which of those placements it should build, and the ones you
  drop are left out. Nothing is written until you approve the plan. You can send
  it back with feedback as often as you like, or stop, and when the changes are
  made the wizard prints them for you to review. It never commits.
