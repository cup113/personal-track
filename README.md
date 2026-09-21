# personal-track

DeepSeek Harness（DSH）插件：右侧栏的**每日习惯看板** + 主区域的**统计页**。

- 领域语言：[CONTEXT.md](./CONTEXT.md) —— 五形态（打卡/计数器/槽位/会话/登记）、习惯日与夜段、目标、格、任务进度
- 决策记录：[docs/adr/](./docs/adr/) —— 传输选型、状态派生不落库
- 上游插件开发文档快照：`.dsh-docs/`（git 忽略）

## 功能

| 分组 | 习惯 | 形态与交互 |
|---|---|---|
| 日常 | 洗漱 ×2、洗澡 ×1、洗衣 | 打卡：空槽是一个虚线 `＋`，记一条就多一个可改可删的时间块，记满即不再出现按钮；洗衣是**存量 + 洗涤会话**：±1 与"修正"只调存量不留记录，"洗完"记下件数与时点 |
| 饮食 | 早饭/午饭/晚饭 | 三行紧凑排布：点 `＋` 即盖时间戳，✎ 改时间与价格，× 清除 |
| 学习 | 背单词、多邻国 | 背单词按当日目标（新词/复习）计进度、可改目标、超额单列；多邻国任意节数 |
| 健身 | 跑步、跳绳、引体向上、健身器材 | 跑步每日至多一次并显示派生配速；跳绳 90/180 定数；引体记支撑时长；器材记名称/动作数/重量 |
| 记录 | 影视书籍、任务作业 | 跨日保留的状态登记：媒体三态 + 5 星评分；任务进度 → 三态派生 + 逾期，一键完成 |

两处**初值**是替你算好的：新增会话（背单词 / 多邻国 / 健身 / 洗衣）的**时间默认当前时刻**
（正是宿主本会盖上的那个值，改一下即可补录）；新建任务的**截止默认本周末**
（周一为一周之始，即当前习惯日所在周的周日），仍是可改可清空的普通日期字段。

**完成条是分数的，不是复选框。** 8 个习惯格（洗漱 2、洗澡 1、三餐 3、背单词 1、多邻国 1）之外，
**当日到期的任务各占一格**，所以读数是 `5.3/9` 这样的形式：背单词那格填的是加权目标进度
（做了一半就是半格），任务那格填的是 `当前/目标量`。每个小方格按自己的分数**渐变填绿**，
鼠标悬停给出具体百分比——「今天完成了多少」是连续量，布尔答不了。

**任务的截止日是会有颜色的**：逾期与当天红色、3 日内橙色、7 日内黄色，更远则不强调；
列表顺序是未完成在前、已完成后，各自按截止日升序，没有截止日的排在各自组末。
完成**不是删除**：勾完只是把进度推到目标量，记录与完成时间都留着，只有 × 才真正删除。

**每条任务占两行**：第一行是「标题 (分类) 截止于X」，第二行是进度条 + `当前/目标量` + ✎ + ×。
进度条兼作输入：拖动（或聚焦后按 ←/→）即改任务进度，**拖动时手柄与右侧读数实时跟随，松开才写一次**；
没有目标量的任务退化为勾选项，点一下即可完成。完成状态不写成文字——满格加 ✓ 就是完成，条变红就是逾期。
读数占定宽（`10/10` 也放得下），拖到进位时行宽不跳。**过了截止日且已完成的任务**收进列表底部的
**归档**折叠区（纯前端派生，不落库、不动统计），活跃列表只剩还需要看的事。

看板顶部是**完成度环 + 完成条**（8 个习惯格，外加当日到期的任务格），
按分组自上而下全部列出（不做筛选），可切换到任意历史日**补卡**（不能进入未来；凌晨时段标注为"周X夜"）。

看板最底部是**复制纯文本报告**：把正在看的一天折成几行纯文本（完成度一行、每组习惯一行、
当日到期任务一行）一键进剪贴板，直接粘到聊天里分享；剪贴板 API 不可用时走隐藏文本域兜底。

背单词的进度是**加权**的：一个复习词按 1/5 个新词计入，分子分母同权，所以 100% 依然等于"目标达成"。

统计页按范围（近 7 天 / 本月 / 近 30 天 / 近 90 天 / 自定义）给出：习惯×日期热力图、
每习惯达标数与连续天数、各习惯的求和指标、三餐（早饭打卡 + 总花费），以及**心率-配速曲线**。

统计页底部还有一张**数据**卡片：导出整个域为一份 JSON，或把这样一份文件读回来
（先选文件预览条数，再决定**合并**还是**覆盖**）。详见 [数据](#数据)。

## 安装

> **这是给自己写的插件，不是通用产品：习惯清单是硬编码的。**
> 八个习惯格（洗漱 ×2、洗澡、三餐、背单词、多邻国）就写在 `src/host/derive.ts` 的 `CELL_IDS` 里，
> 注释也直说「hard-coded in v1 by decision」——**没有"配置习惯"的开关**。
> 所以**要自己用，强烈建议 fork 源码、把清单与常量改成自己的再构建**，而不是原样装上再找开关：
> 改代码远比加开关便宜，直接装上的只是别人的作息表。

走 `Config` 的只有下面四个（写在 `cordis.yml`，不改代码就能调）：

| 字段 | 默认 | 作用 |
|---|---|---|
| `dayStartHour` | `4` | 习惯日起点；00:00–04:00 归前一晚 |
| `timezone` | 本机时区 | 固定时区覆盖 |
| `defaultVocabTarget` | `{ new: 20, review: 60 }` | 无历史快照可继承时的背单词目标 |
| `defaultRunMinutes` | `30` | 新跑步记录的默认时长 |

其余全在源码里，**所谓"二改"就是改这些文件**：

| 要改的东西 | 位置 |
|---|---|
| 习惯清单、格数与格名 | `src/host/derive.ts` — `CELL_IDS` / `CELL_LABEL` |
| 每格怎么算达成（洗漱 2 次、洗澡 1 次、三餐各 1 次、多邻国 ≥1 节） | `src/host/derive.ts` — `dayCells()`；次数上限校验在 `src/host/api.ts` |
| 背单词加权（复习 1 词按新词 1/5 计） | `src/host/derive.ts` — `NEW_WEIGHT` / `REVIEW_WEIGHT` |
| 存什么字段（域 schema，跳绳 90/180 之类的定数也在这里） | `src/host/domain.ts` |
| 看板分组、卡片与顺序 | `src/client/board/BoardBody.tsx` |
| 统计页的指标卡 | `src/client/board/stats-panel.tsx` |

改完按 [开发](#开发) 重新构建：**动过宿主半身要重启 `dsh --profile web`**，只动客户端 bundle 是热重载。
改到 `src/host/domain.ts` 就是改磁盘格式，别忘了那里的域 `version`。

```powershell
# 持久安装（推荐）：pnpm link 到 web profile，需要重启一次
dsh plugin --profile web add link:D:/Projects/personal-track
dsh --profile web --dump-config        # 应出现 "# == personal-track" 层
# 然后重启：dsh --profile web
```

临时试用（不安装，改完即用）：

```powershell
# --patch 是启动器级选项，必须写在 web 之前；写成 dsh web --patch … 会被转发给 web 应用并报错
dsh --profile web --patch D:/Projects/personal-track/dev.patch.yml
```

patch 行的两条对齐铁律：`name` 必须是包名（Loader 据此从 profile 的 `node_modules` 解析代码），
`id` 必须等于宿主半身导出的 `name`——本插件三条（包名 / `name` / `id`）都是 `personal-track`。

## 开发

```powershell
pnpm install
pnpm build        # 产出 lib/index.js（ESM）与 lib/client.js（浏览器闭包工厂）
pnpm watch        # 只重建产物；客户端 bundle 改动会被宿主轮询到并热重载
pnpm typecheck    # 三个独立程序（宿主 / 浏览器 / 测试）
pnpm test         # 数据层断言 + 客户端纯函数断言（习惯日算法、派生值、周末/初值）
pnpm verify       # 客户端 facade + 宿主真实栈端到端
```

**宿主代码改动必须重启 `dsh`**（Node 的 ESM 缓存不因 patch 重载失效）；**客户端 bundle 改动是热重载**。
若客户端比宿主新，看板会直接提示「插件宿主半身未更新：请重启 dsh --profile web」。

## 数据

`~/.dsh/storages/habit/`，人类可读的 JSON，per-record 布局：

| 路径 | 内容 |
|---|---|
| `days/<YYYY-MM-DD>.json` | 一个习惯日的全部数据（打卡时间、槽位、会话、洗涤） |
| `counters/laundry.json` | 待洗存量（权威值；洗涤历史在天文档里） |
| `media/<id>.json` · `tasks/<id>.json` | 登记条目 |

**空白天不产生文档**：没有任何记录的一天在磁盘上不存在，读接口也从不创建文档。

### 备份

统计页的「导出」拿到一份 `personal-track-<日期>.json`：

```json
{ "format": "personal-track/backup", "version": 1, "exportedAt": "…",
  "days": [ … ], "counters": { "laundry": { … } }, "media": [ … ], "tasks": [ … ] }
```

它**只含事实**：没有格数、比率、连续天数、逾期标记——这些导入后从记录重算，所以文件里不可能有
与数据本身矛盾的字段（任务/媒体各自带 `id`，日文档自带 `date`，因此不需要外层键）。

「选择备份…」只解析文件并显示条数，**此时还没有写入**；随后：

- **合并**：文件里的记录按同键覆盖，本地多余的保留；
- **覆盖（清空现有）**：额外删除文件中没有的本地记录，用于整机迁移或回滚。

宿主会先把整份文件按同一套 zod schema 校验通过再落盘，任何一条不合法即整份拒绝（400 `habit/bad-backup`），
不会出现"导入了一半"。

## 结构

```
src/host/    index.ts（装配）· config.ts · daykey.ts（习惯日算法）
             domain.ts（zod + 域声明）· derive.ts（派生规则）· store.ts（域访问）
             backup.ts（事实文件的读写与校验）· api.ts（/habit/api）· stats.ts（范围聚合）
src/client/  index.tsx（注册面）· api.ts（命令面）· types.ts（线上契约）
             styles.ts（注入式样式表）· board/（tile 原语 + 看板卡片 + 统计面板 + 数据卡片）
scripts/     build.mjs（esbuild CLI 双产物）· verify-client.mjs · verify-host.mjs
tests/       data-layer.test.ts（宿主）· client-format.test.ts（客户端纯函数）
docs/adr/    0001 树外传输 · 0002 状态派生不落库
```

## 工具链注意事项（都踩过）

- **esbuild 用原生 CLI，不用其 JS API**：JS API 通过管道 stdio 派生编译器子进程，被 DSH 文件沙箱拒绝
  （`spawn EPERM`）；CLI 本身就是编译器，以继承 stdio 执行，无需管道派生。
- **测试用 Node 原生类型剥离**（`node tests/*.test.ts`）而不是 vitest：vite/vitest 内部经 esbuild JS API
  转换 TS，同样被沙箱挡住。
- **`pnpm-workspace.yaml` 的 `allowBuilds: esbuild: false`**：我们直接调二进制，不需要它的 postinstall。
- **客户端 bundle 的运行时依赖只能是冻结平台表内的模块**（当前只用到 `react` 与 `react/jsx-runtime`）；
  其他 `@deepseek-ai/*` 一律 `import type`，构建期擦除。跨插件取值一律经 `ctx` 服务或 slots。
- **SlotMap 是按 import 做声明合并的**：用到某个 slot 就必须 import 声明它的包（例如
  `sidebar.panellist` 在 `@deepseek-ai/dsh-client-ui-sidebar/client`），否则类型上根本不存在。
- **`ctx.<服务>` 每一个都要写进客户端插件的 `inject` 导出**：声明合并让类型随时可见，但 cordis
  运行时只解析 inject 集合里的服务名，漏写要到真正访问那一刻才抛
  `cannot get property "…" without inject`（统计按钮的 `ctx.layout` 就这样漏过）。`scripts/verify-client.mjs`
  的假 context 是带同款守卫的 Proxy，未声明的访问会在 facade 测试里当场炸掉。
