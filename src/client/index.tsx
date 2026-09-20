/**
 * personal-track — browser half.
 *
 * Registers the `habit-board` page type with its guide entry, and mounts the
 * board as that page type's tab body. The board talks to the host through the
 * command face injected into the registration, never through `ctx`.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { createHabitClient } from './api.ts'
import { BoardBody } from './board/BoardBody.tsx'
import { ensureBoardStyles } from './styles.ts'

/** Services that must be live before `apply` runs. */
export const inject = ['slots', 'sidebarRightTabs']

/** Stable tab-type id; it keys the body slot registration. */
const BOARD_ID = 'personal-track-board'

/** The page kind opened by `ctx.sidebarRight.openTab('habit-board')`. */
const BOARD_KIND = 'habit-board'

/** Register the board tab type plus its body. */
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
    { name: 'sidebar.right.pane.tab', key: BOARD_ID, inject: () => ({ client }) },
    BoardBody,
  )), 'personal-track: board body')
}
