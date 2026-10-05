// One button: the slash command it runs, the icon drawn before its name in its own color, and an optional label.
export type DockItem = { command: string; icon: string; label?: string; color?: string }

declare module 'claude-code' {
  interface PluginState {
    dock: {
      items: DockItem[]
      // the panes shown now, by id: a button whose command opens a pane of its name lights up
      shown: string[]
      filter: string
    }
  }
}
