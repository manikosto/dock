# dock

A row of clickable buttons under the Claude Code prompt.

```text
❯ _
[ ◧ deck ] [ ▤ files ] [ ◉ preview ] +   ? for shortcuts
```

- **Toggle mods**: a button runs its command; a mod whose pane is open lights up, and a click closes it.
- **Pin anything**: `+` (or `/dock`) opens a picker with every slash command, built-in ones, plugins, your skills and MCP prompts, with a filter. Click to add or remove.
- **Colored icons**: each pinned command gets its own bright color, kept when you reorder; an open mod shows as a chip of it.
- **Kept across sessions.** The default row is deck, files and preview.

```text
/dock                 open the picker
/dock add compact     pin /compact
/dock remove preview  unpin /preview
/dock reset           back to deck, files and preview
```

Clicks work in fullscreen mode; keys `1`–`9` press a button while the row has the keyboard (ctrl+x, Tab).

## Install

```sh
claude plugin marketplace add manikosto/dock
claude plugin install dock@dock
```

Needs Claude Code 2.1.289 or later.

## License

MIT
