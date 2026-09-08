# @specify-sh/wizard

## 0.2.0

### Minor Changes

- d2465a7: Make the run visible while it happens, and stop asking for a publisher key.
  
  The wizard now runs as a full-screen terminal app built around a checklist.
  Every step of the run is on screen from the start and only its state moves, so
  the screen never grows under you and you can always see where you are and what
  is still to come. Under it, the running step shows what the agent is actually
  doing — the files it reads, the commands it runs, the files it writes.
  
  The plan is asked for as structured output and rendered as markdown at the
  terminal's own width. It scrolls on the mouse wheel — reporting is turned on
  just for the review, so the wheel moves the plan instead of the selection —
  and on PgUp/PgDn or Ctrl-U/Ctrl-D for keyboards without page keys, so the agent's running commentary can no longer end up
  pasted onto the front of it, and placements arrive as data rather than being
  scraped out of headings.
  
  The publisher key prompt is gone. The agent always writes the placeholder, and
  the wizard names the env file it landed in once the run is over, along with
  where to get a key. Nothing asks for a secret any more.
  
  Untracked files are listed one by one in the change summary rather than
  collapsed into the directory holding them. `--verbose` names the underlying
  cause when something fails.
  
  Ctrl-C now stops the wizard. Raw mode never turns it into a signal, so the
  keystroke is watched for and raised out of whichever prompt was open, and a
  turn that finishes after you asked to stop no longer carries on to the next
  question.
  
  The wizard now also fetches the full publishing documentation as one file
  (`/publishing/llms-full.txt`) alongside the index and inlines it into the
  planning turn, so the agent reads instead of fetching page by page — each
  page fetch used to cost a whole model round trip. When the docs site does
  not serve the bundle, the wizard falls back to the index exactly as before.

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
