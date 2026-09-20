/**
 * personal-track — browser half (M0 skeleton).
 *
 * Registers the `habit-board` page type and its right-sidebar tab body. The
 * board itself lands in M2; M0 only proves the bundle, the tab registry and the
 * slot registration work end to end.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { JSX } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Services that must be live before `apply` runs. */
export const inject = ['slots', 'sidebarRightTabs']

/** Stable tab-type id; it keys the body slot registration. */
const BOARD_ID = 'personal-track-board'

/** The page kind opened by `ctx.sidebarRight.openTab('habit-board')`. */
const BOARD_KIND = 'habit-board'

/** Register the board tab type plus its body. */
export function apply(ctx: Context): void {
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
    { name: 'sidebar.right.pane.tab', key: BOARD_ID },
    BoardBody,
  )), 'personal-track: board body')
}

/** M0 placeholder body: replaced by the real kanban in M2. */
function BoardBody(): JSX.Element {
  return <div style={{ padding: 12, opacity: 0.8 }}>personal-track · M0</div>
}
