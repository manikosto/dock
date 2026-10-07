import { atom, read, update } from 'claude-code'
import type { CommandInfo, EngineInterface, Register } from 'claude-code'
import type { DockItem } from '../types'

type Engine = EngineInterface

const SETTINGS = 'dock-settings'

// Bright, distinct colors, handed out in order: each pinned command keeps the one it got.
const PALETTE = ['#ff8a5c', '#5cc8ff', '#c792ea', '#7ee787', '#ffd166', '#ff6ea8', '#4fd6be', '#f78c6c', '#82aaff', '#c3e88d']

const DEFAULTS: DockItem[] = [
  { command: 'deck', icon: '◧', color: '#ff8a5c' },
  { command: 'files', icon: '▤', color: '#5cc8ff' },
  { command: 'aside', icon: '◇', color: '#4fd6be' },
]

const nextColor = (list: DockItem[]) => PALETTE.find(c => !list.some(i => i.color === c)) ?? PALETTE[list.length % PALETTE.length]!
const colorOf = (item: DockItem, i: number) => item.color ?? PALETTE[i % PALETTE.length]!

// Icons for commands people often pin; anything else gets a dot.
const ICONS: Record<string, string> = {
  deck: '◧', files: '▤', aside: '◇', glint: '✦', compact: '⇲', clear: '⌫', context: '◔', cost: '$',
  model: '◆', config: '⚙', plugin: '⧉', mcp: '⌁', review: '✓', agents: '◈', memory: '✎', help: '?',
  'reload-plugins': '↻', status: 'ℹ', export: '⇪', resume: '↺', init: '✱', hooks: '⚓', permissions: '⚿',
}
const iconFor = (command: string) => ICONS[command] ?? '•'

const items = atom({ plugin: 'dock', key: 'items' } as const, DEFAULTS)
const shown = atom({ plugin: 'dock', key: 'shown' } as const, [] as string[])
const filter = atom({ plugin: 'dock', key: 'filter' } as const, '')

let commands: CommandInfo[] = []

async function save($: Engine, next: DockItem[]) {
  await update($, items, () => next)
  await $.store.set('items', next)
}

async function toggleItem($: Engine, command: string) {
  const list = await read($, items)
  const next = list.some(i => i.command === command)
    ? list.filter(i => i.command !== command)
    : [...list, { command, icon: iconFor(command), color: nextColor(list) }]
  await save($, next)
}

// The panes shown now. A dock button lights up while a pane named like its command is open.
async function syncPanes($: Engine) {
  const panes = await $.ui.panes().catch(() => [])
  const ids = panes.filter(p => p.isShown).map(p => p.id).sort()
  const was = await read($, shown)
  if (ids.join(',') !== was.join(',')) await update($, shown, () => ids)
}

// A press: close the item's pane if it is open; otherwise first close the other mods' panes, then run its
// command. The dock beside the transcript takes its width when it opens, so one pane at a time lets each
// mod open at its own width (files wide, deck narrow) instead of inheriting whatever was open.
async function press($: Engine, item: DockItem) {
  const panes = await $.ui.panes().catch(() => [])
  const open = panes.find(p => p.id === item.command && p.isShown)
  try {
    if (open) await $.ui.close({ id: item.command })
    else {
      const pinned = new Set((await read($, items)).map(i => i.command))
      const others = panes.filter(p => p.isShown && p.id !== item.command && pinned.has(p.id))
      for (const p of others) await $.command.run({ command: p.id, args: '' }).catch(() => undefined)
      if (others.length) await $.clock.sleep(150)
      await $.command.run({ command: item.command, args: '' })
    }
  } catch (err) {
    $.ui.toast(`/${item.command}: ${err instanceof Error ? err.message : String(err)}`)
  }
  await syncPanes($)
}

async function openSettings($: Engine) {
  commands = await $.command.list().catch(() => [])
  await update($, filter, () => '')
  return $.ui.open({ id: SETTINGS, title: 'dock: pick buttons', focus: true, closeOnEscape: true })
}

const SOURCE_ORDER: Record<string, number> = { plugin: 0, user: 1, mcp: 2, builtin: 3 }
const SOURCE_LABEL: Record<string, string> = { plugin: 'Mods and plugins', user: 'Your commands and skills', mcp: 'MCP', builtin: 'Built in' }

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const stored = await $.store.get('items').catch(() => undefined)
    if (Array.isArray(stored)) await update($, items, () => stored.filter((i): i is DockItem => typeof i?.command === 'string'))
    await $.command.register({ name: 'dock', description: 'Pick the buttons under the prompt', argumentHint: '[add|remove <command>] | reset' })
    // panes open and close from many places (Esc, their own commands): look every second and a half
    $.clock.every(1500, () => { void syncPanes($) })
    return next(e)
  })

  // One pane at a time, however a pinned mod is opened (a dock button or a typed command): the dock
  // beside the transcript takes its width when it opens, so the others close first and it reopens at
  // the width the new pane asks for.
  on('command.run', async ($, e, next) => {
    if (e.command === 'dock' || e.args.trim()) return next(e)
    try {
      const pinned = new Set((await read($, items)).map(i => i.command))
      if (pinned.has(e.command)) {
        const panes = await $.ui.panes()
        const isOpening = !panes.some(p => p.id === e.command && p.isShown)
        const others = isOpening ? panes.filter(p => p.isShown && p.id !== e.command && pinned.has(p.id)) : []
        for (const p of others) await $.ui.close({ id: p.id }).catch(() => $.command.run({ command: p.id, args: '' }))
        if (others.length) await $.clock.sleep(150)
      }
    } catch {}
    return next(e)
  })

  on('command.run', { command: 'dock' }, async ($, e) => {
    const [verb, name] = e.args.trim().split(/\s+/)
    const cmd = name?.replace(/^\//, '')
    if (verb === 'add' && cmd) {
      const list = await read($, items)
      if (!list.some(i => i.command === cmd)) await save($, [...list, { command: cmd, icon: iconFor(cmd), color: nextColor(list) }])
      return { text: `Added /${cmd} to the dock.` }
    }
    if (verb === 'remove' && cmd) {
      await save($, (await read($, items)).filter(i => i.command !== cmd))
      return { text: `Removed /${cmd} from the dock.` }
    }
    if (verb === 'reset') {
      await save($, DEFAULTS)
      return { text: 'The dock is back to deck, files and aside.' }
    }
    const r = await openSettings($)
    return { text: r.isPlaced ? 'Pick the buttons: click to add or remove, Esc to close.' : `dock settings wait: ${r.reason ?? 'no room'}` }
  })

  // The line under the prompt: the dock's buttons, then the engine's own hint.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const list = await read($, items)
    const open = new Set(await read($, shown))
    const { Box, Text, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" columnGap={1}>
        {list.map((item, i) => {
          const isOn = open.has(item.command)
          const color = colorOf(item, i)
          // the icon carries the item's color; a mod whose pane is open gets a chip of it
          return (
            <Box key={`dock-${item.command}`} flexDirection="row">
              <Text color={isOn ? '#1e1e24' : color} backgroundColor={isOn ? color : undefined} bold>{` ${item.icon} `}</Text>
              <Button
                key={`dock-b-${item.command}`}
                plain
                label={item.label ?? item.command}
                hotkey={i < 9 ? String(i + 1) : undefined}
                dimColor={!isOn}
                onPress={() => { void press($, item) }}
              />
            </Box>
          )
        })}
        <Button key="dock-add" label="+" plain dimColor onPress={() => { void openSettings($) }} />
        {e.props.hint ? <Text dimColor wrap="truncate">{`  ${e.props.hint}`}</Text> : null}
      </Box>
    )
  })

  // The picker: every slash command, the dock's own first, a filter on top.
  on('ui.render', { component: 'Pane', requestId: SETTINGS }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e) as any
    const list = await read($, items)
    const pinned = new Set(list.map(i => i.command))
    const q = (await read($, filter)).toLowerCase()
    const cols = Math.max(30, (e.props as { bodyColumns?: number }).bodyColumns ?? 60)
    const all = commands
      .filter(c => !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
      .sort((a, b) => (SOURCE_ORDER[a.source] ?? 9) - (SOURCE_ORDER[b.source] ?? 9) || a.name.localeCompare(b.name))
    const rows: any[] = []
    let group = ''
    for (const c of all.slice(0, 120)) {
      if (c.source !== group) {
        group = c.source
        rows.push(<Text key={`g-${group}`} bold color="#e8875b">{SOURCE_LABEL[group] ?? group}</Text>)
      }
      const isPinned = pinned.has(c.name)
      rows.push(
        <Box key={`c-${c.name}`} flexDirection="row" columnGap={1} width={cols}>
          <Text color={isPinned ? colorOf(list.find(i => i.command === c.name)!, list.findIndex(i => i.command === c.name)) : '#5b5b66'}>{iconFor(c.name)}</Text>
          <Button key={`t-${c.name}`} plain label={`${isPinned ? '✓' : '○'} /${c.name}`} variant={isPinned ? 'primary' : undefined} onPress={() => { void toggleItem($, c.name) }} />
          <Text dimColor wrap="truncate">{c.description}</Text>
        </Box>,
      )
    }
    return (
      <Box flexDirection="column" width={cols}>
        <Text key="head" dimColor>{`In the dock: ${list.map(i => '/' + i.command).join(' ') || 'nothing'}`}</Text>
        {Input ? <Input key="filter" placeholder="filter commands" autoFocus onInput={(v: string) => { void update($, filter, () => v) }} onSubmit={(v: string) => { void update($, filter, () => v) }} /> : null}
        {rows.length ? rows : <Text key="none" dimColor>No command matches.</Text>}
        {all.length > 120 ? <Text key="more" dimColor>{`… ${all.length - 120} more, filter to find them`}</Text> : null}
      </Box>
    )
  })
}
