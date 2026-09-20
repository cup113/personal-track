/**
 * personal-track — browser half.
 *
 * Registers two surfaces: the `habit-board` page type in the right sidebar
 * (with its guide entry) and a `habit-stats` page in the main area, reachable
 * from the board and from a sidebar entry.
 *
 * Both talk to the host through the command face injected into their slot
 * registration, so neither component ever sees `ctx`.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { createHabitClient } from './api.ts'
import { BoardBody } from './board/BoardBody.tsx'
import { StatsIcon, StatsPanel } from './board/stats-panel.tsx'
import { ensureBoardStyles } from './styles.ts'

/**
 * Services that must be live before `apply` runs.
 *
 * Every `ctx.<prop>` service access needs its name here — cordis resolves
 * service props through the fiber's inject set and throws
 * `cannot get property "prop" without inject` otherwise. `ctx.layout` backs
 * `openStats`, so it is required alongside the two registration faces.
 */
export const inject = ['slots', 'sidebarRightTabs', 'layout']

/** Stable tab-type id; it keys the body slot registration. */
const BOARD_ID = 'personal-track-board'

/** The page kind opened by `ctx.sidebarRight.openTab('habit-board')`. */
const BOARD_KIND = 'habit-board'

/** The main-area panel that hosts the statistics. */
const STATS_PANEL_ID = 'personal-track-stats' as MainPanelId

/** Register the board tab type, its body, and the statistics panel. */
export function apply(ctx: Context): void {
  ensureBoardStyles()
  const client = createHabitClient()

  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: BOARD_ID,
    kind: BOARD_KIND,
    title: () => '习惯看板',
    guide: [{
      order: 10,
      title: () => '习惯看板',
      description: () => '每日习惯打卡',
    }],
  }), 'personal-track: board tab type')

  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    {
      name: 'sidebar.right.pane.tab',
      key: BOARD_ID,
      // The board also needs a way out of the sidebar, into the stats page.
      inject: () => ({ client, openStats: () => ctx.layout.selectPanel(STATS_PANEL_ID) }),
    },
    BoardBody,
  )), 'personal-track: board body')

  ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register(
    { name: 'main', key: STATS_PANEL_ID, inject: () => ({ client }) },
    StatsPanel,
  )), 'personal-track: stats panel')

  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
    { name: 'sidebar.panellist', id: STATS_PANEL_ID, order: 20, label: () => '习惯统计' },
    StatsIcon,
  )), 'personal-track: stats entry')
}
