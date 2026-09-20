# personal-track：DSH 个人习惯追踪插件 — 实施计划（v2 · grill 后）

> 领域语言以 [CONTEXT.md](./CONTEXT.md) 为准（习惯形态、习惯日、目标、格、任务进度等规范术语）；本文件是工程实施计划。
> 目标环境：已安装的 `dsh web`（npm `@deepseek-ai/dsh@0.1.5-rc.2`，GUI http://127.0.0.1:3080）
> 调研基础：`.dsh-docs/`（上游插件开发文档快照 @ ddefc45f）+ 上游源码核对（`D:\Projects\deepseek-harness`）

## 0. 决策总表（12 轮 grill 结论）

| # | 议题 | 裁定 |
|---|---|---|
| 1 | 领域分类学 | 五形态：**打卡 / 计数器 / 槽位 / 会话 / 登记**；跑步归会话（≤1/天）；背单词另有**目标**（挂在日记录上的期望值） |
| 2 | 登记内部分化 | 拆为**媒体**（日志形）与**任务**（任务形）；**避免 "Todo"**（与 DSH 会话级 Todo 冲突） |
| 3 | 洗衣 | 方案 B：**存量计数器**（权威值）+ **洗涤会话**（历史）；"洗完"扣存量并记会话；攒衣服只加存量；**修正只调存量不留事件** |
| 4 | 目标归属 | 4a **每天快照**；4b 当日可直接改（进度不动、完成率即时重算）；4c 多邻国初判无目标 → **后修正为存在目标** |
| 5 | 4 点界线 | 5a 凌晨打开显示**前一个习惯日**；5b 标注"**周X夜**"；5c **禁止导航到未来** |
| 6 | chip 分母 | **8 格硬编码**：洗漱 2 + 洗澡 1 + 三餐 3 + 背单词 1 + 多邻国 1（存在目标） |
| 7 | 撤销/删除 | 打卡逐条可删；槽位可改可清；会话逐条可改可删；计数器走修正；登记**硬删除**；**无"删除整日"**；历史与今天同一幂等写路径 |
| 8 | 统计口径 | 8a **分习惯 streak**（完美日只做计数）；8b **空白天断 streak**（补卡即时重算）；8c 默认**本月**、周一起算 |
| 9 | 媒体字段 | kind(film\|book) · title · status(在看在读/完成/**弃**) · rating(**5 星**,可空) · startedAt/finishedAt · notes；**不做页数进度** |
| 9b | 任务字段 | **任务进度 `current/total`**（total 可省）→ **三态派生**（待办/进行中/完成）；category 可选 · due 仅日期 · notes；**只有完成时间落库**；取消完成清空完成时间 |
| 10 | 时区 | **跟随本机时区**；Config 留可选固定时区覆盖 |
| 11 | 统计面板 | 三块内容（完成率/求和/登记），砍掉：平均用餐时刻、单次极值、器材容量；**纯数字卡 + CSS 热力网格 + CSS 条形**，不引图表库 |
| 11b | 跑步曲线 | **心率-配速曲线**：每次跑步一个点（x=配速,y=平均心率）跨次趋势；跑步**记录时长（默认 30，可改）**；配速为派生值；单次秒级采样（设备导入）**出范围**；这是**唯一**手写 SVG 图 |
| 12 | 目标继承 | **向前继承**：新习惯日取最近一个有快照的日的目标，无历史则用 Config 默认；快照存在即不被继承改写 |

## 1. 总体架构

```
┌─ 浏览器（dsh web GUI，React 18）────────────────┐
│ client 半身（lib/client.js，CJS 闭包工厂）        │
│  · 右侧栏 tab：habit-board 看板                   │
│  · 主面板：habit-stats 统计（含心率-配速曲线）     │
│  · 数据经 fetch('/habit/api/…') 同源读写          │
└────────────────────┬────────────────────────────┘
                     │ HTTP (node:http)
┌─ 宿主（Node）──────┴────────────────────────────┐
│ host 半身（lib/index.js，ESM）                   │
│  · inject ['storageDomain', 'webServer']         │
│  · ctx.webServer.register({kind:'prefix',        │
│      path:'/habit/api', handler})  JSON API      │
│  · ctx.storageDomain.open(habitDomainSpec)       │
│  · 全部派生计算与聚合在宿主（读是内存同步的）      │
└──────────────────────────────────────────────────┘
```

**为什么不用 `ctx.remote`**：第三方包无法运行仓库内的 Typert 代码生成器，客户端 codec 只来自生成产物（docs/api-gateway.md:137）；exact Fetch 路由是文档指定的替代通道（docs/api-gateway.md:162、web-server.md:18-27）。服务键 `storageDomain`/`webServer` 已核对库内用法。

- 写接口返回受影响切片，前端本地合并；MVP 不做推送，`focus` + 60s 轮询兜底（多标签同步留待 SSE）。
- 数据落在 `~/.dsh/storages/habit/`（人类可读 JSON，每日一文档）。

## 2. 数据模型（最终）

domain `habit`，`version: 1`，`layout: 'per-record'`，json 后端。

```ts
// days: 每日一文档，键 = 'YYYY-MM-DD'（习惯日）
const sessionId = z.string()                     // 每条会话带稳定 id：编辑/删除的寻址依据

const dayRecord = z.object({
  date: z.string(),                              // 键的副本，自校验

  // 打卡 Check
  washes:  z.object({ times: z.array(z.string()).default([]) }),        // 上限 2 格
  shower:  z.object({ at: z.string().nullable().default(null) }),       // 1 格

  // 槽位 Slot
  meals: z.object({                                                     // 3 格
    breakfast: z.object({ at: z.string(), price: z.number().optional() }).optional(),
    lunch:     z.object({ at: z.string(), price: z.number().optional() }).optional(),
    dinner:    z.object({ at: z.string(), price: z.number().optional() }).optional(),
  }).default({}),

  // 会话 Session（背单词另有目标快照）
  vocab: z.object({                                                     // 1 格（数量目标）
    target:   z.object({ new: z.number().int(), review: z.number().int() }),
    sessions: z.array(z.object({ id: sessionId, at: z.string(),
                new: z.number().int(), review: z.number().int(), minutes: z.number() })).default([]),
  }),
  duolingo:  z.array(z.object({ id: sessionId, at: z.string(), minutes: z.number() })).default([]),  // 1 格（存在目标）
  run:       z.object({ at: z.string(), minutes: z.number(),            // ≤1/天，默认 30
               distanceKm: z.number(), avgHr: z.number().optional() }).nullable().default(null),
  rope:      z.array(z.object({ id: sessionId, at: z.string(),
               preset: z.union([z.literal(90), z.literal(180)]),
               seconds: z.number(), avgHr: z.number().optional() })).default([]),
  pullup:    z.array(z.object({ id: sessionId, at: z.string(), seconds: z.number() })).default([]),
  equipment: z.array(z.object({ id: sessionId, at: z.string(), name: z.string(),
               reps: z.number().int(), weight: z.number().optional() })).default([]),
  washing:   z.array(z.object({ id: sessionId, at: z.string(), pieces: z.number().int() })).default([]),  // 洗涤会话
})

// counters: 跨日持久（洗衣存量权威值）
counters.laundry = z.object({ pending: z.number().int().min(0), updatedAt: z.string() })

// media: 媒体登记（硬删除）
media = z.object({ id, kind: z.enum(['film','book']), title: z.string(),
  status: z.enum(['active','done','dropped']),                          // 在看在读/完成/弃
  rating: z.number().int().min(1).max(5).optional(),
  startedAt: z.string().optional(), finishedAt: z.string().optional(),
  notes: z.string().optional(), createdAt: z.string() })

// tasks: 任务登记（硬删除）
tasks = z.object({ id, title: z.string(), category: z.string().optional(),
  due: z.string().optional(),                                           // 仅日期
  progress: z.object({ current: z.number().int().min(0).default(0), total: z.number().int().optional() }),
  completedAt: z.string().optional(), notes: z.string().optional(), createdAt: z.string() })
```

**派生清单（一律不落库）**

| 派生值 | 规则 |
|---|---|
| 目标进度 | 背单词 = Σ sessions.new / Σ sessions.review；多邻国 = 存在性（≥1 节） |
| **格完成** | 洗漱 `times.length`（≤2）· 洗澡 `at≠null` · 三餐各有值 · 背单词达目标 · 多邻国 ≥1 节 → chip `n/8` |
| 超额 | `max(0, 实际 − 目标)`，完成率封顶 100% |
| 任务状态 | `current=0` 待办 / `0<current<total` 进行中 / `current≥total` 完成 |
| 逾期 | `due < 今天 && 未完成` |
| 配速 | `minutes ÷ distanceKm`（分′秒″/公里） |
| streak | 分习惯连续达标天数；空白天中断；补卡后重算 |
| 完美日 | 单日 8/8 |

**目标向前继承**：新建日快照 = 最近一个有 `vocab.target` 的日的值，否则 Config 默认（`{new:20, review:60}`）；已存在快照永不被改写。

## 3. HTTP API（prefix `/habit/api`）

| 方法 / 路径 | 作用 |
|---|---|
| `GET /state?date=` | 当日 day + 洗衣存量 + 媒体/任务摘要 + 设置（date 缺省 = 当前习惯日） |
| `POST /check` `{date, habit:'wash'\|'shower'}` · `DELETE /check` | 打卡 / 逐条撤销（wash 走 times 栈） |
| `PUT /meal` `{date, slot, at, price?}` · `DELETE /meal?date=&slot=` | 槽位打卡 / 清除 |
| `POST /session` `{date, kind, entry}` · `PATCH /session` `{date, kind, id, patch}` · `DELETE /session` | 会话增改删（kind ∈ vocab\|duolingo\|rope\|pullup\|equipment\|washing） |
| `PUT /run` `{date, minutes, distanceKm, avgHr?}` · `DELETE /run` | 跑步（≤1/天，minutes 默认 30） |
| `PUT /vocab-target` `{date, new, review}` | 改当日目标快照 |
| `POST /laundry/wash` `{date, pieces}` · `PATCH /laundry/stock` `{pending}` | 洗完（扣存量+记会话）/ 修正（只调存量） |
| `GET/POST/PATCH/DELETE /media` `{id}` | 媒体 CRUD |
| `GET/POST/PATCH/DELETE /tasks` `{id}` | 任务 CRUD（PATCH 含 `progress`） |
| `GET /stats?from=&to=` | 宿主聚合（见 §4 统计面板） |
| `GET /backup` · `POST /backup` `{mode:'merge'\|'replace', backup}` | 导出事实文件 / 导入（整份先校验，400 `habit/bad-backup`） |

错误统一 `{ error: { code, message } }`；所有写路径幂等且以 `date` 为参数（历史与今天无区别）。

## 4. UI

**看板 —— 右侧栏 tab（kind `habit-board`）**
- 注册：`ctx.sidebarRightTabs.register({ id:'personal-track-board', kind:'habit-board', title, guide:[…] })`（page tab 默认单实例）+ `ctx.slots.inject('sidebar.right.pane.tab'|'.title', …)` + `sidebar.right.tab.menu.item`（"打开统计"）。
- 顶部：**DateNav**（前后日 / 日历选择，禁未来；**夜段**显示"周X夜"）+ **chip `n/8`**（8 个格点可点）。
- 卡片（单列，适配 ~300px，可 split/float）：日常（洗漱 ×2 与洗澡 ×1 用同一张打卡卡：空槽是虚线 `＋`，记满即不再显示按钮；洗衣：待洗数 + 攒 + **洗完(件数)→会话**+修正）、饮食（三餐紧凑行：`＋` 即记时间，✎ 加价格/改时间）、学习（背单词：加权目标进度条 + 加会话 + 改当日目标；多邻国：列表 + 加一节）、健身（跑步表单：时长默认 30/里程/心率；跳绳 90/180 + 秒数 + 心率；引体支撑秒数；器材 名称/动作数/重量）、记录（媒体、任务迷你卡 + 添加入口）。
- 不做分类筛选：全部卡片自上而下按分组全列（分组标题不带"每日重置"一类说明文字）。
- 会话条目可点开编辑/删除（补卡同界面）。

**统计 —— 主面板（key `'habit-stats' as MainPanelId` + `sidebar.panellist` 图标）**
- 范围选择：默认**本月**，快捷 本周（周一起）/ 近 30 天 / 本季 / 自定义。
- ① 完成率区：**热力网格**（行=习惯，列=天，四态含空白天）· 每习惯完成率与当前连续 · 完美日计数 · 范围平均完成率。
- ② 求和区：背单词（Σ新/Σ复习/总时长/达标天数/超额）· 多邻国（Σ节数/Σ时长/达标天数）· 跑步（次数/Σ里程/平均心率 + **心率-配速曲线**）· 跳绳（次数/90 组/180 组/Σ时长/平均心率）· 引体（次数/Σ支撑时长）· 器材（次数/Σ动作数，按器材分组）· 洗涤（次数/Σ件数）。
- ③ 登记区：三餐（**只列早饭打卡天数与比例 + Σ花费**，避免卡片过高）· 洗衣存量当前值 · 媒体（书影分开的完成数/平均评分/在列）· 任务（完成数/逾期完成数/当前待办·进行中·逾期计数）。
- ④ 数据区：导出/导入备份文件（选文件后先看条数，再选合并或覆盖）。
- 图表策略：数字卡 + CSS 条形 + CSS 热力网格；**仅**跑步曲线用**手写 SVG**（x=配速 min/km，y=平均心率，点标日期）。

**样式**：手写 CSS 经 `styles.ts` 注入 `<style data-personal-track>`，类名前缀 `pt-`（绕开仓库内部 lightningcss 机制）。
**i18n**：locale namespace `personal-track`，zh 主 / en 兜底。

## 5. 仓库结构

```
personal-track/
├── package.json · tsconfig.json · tsconfig.host.json · tsconfig.client.json
├── scripts/build.mjs · scripts/verify-client.mjs · scripts/verify-host.mjs
├── pnpm-workspace.yaml · cordis.patch.yml · dev.patch.yml · README.md · .gitignore
├── CONTEXT.md                       # 领域语言（已建）
├── docs/adr/                        # 决策记录（按需）
└── src/
    ├── host/  index.ts · domain.ts · daykey.ts · derive.ts · api.ts · stats.ts
    └── client/ index.ts · api.ts · store.ts · styles.ts · board/ · stats/ · locales.ts
```

Host/Client 是**两个独立 tsconfig 程序**（两侧都向 cordis `Context` 做声明合并，合一会键冲突）。

## 6. 构建与加载

**package.json 要点**：`"type":"module"`、`exports: { ".":"./lib/index.js", "./client":"./lib/client.js", "./package.json":... }`、`dsh: { client:{platform:'web'}, bundle:{patch:'./cordis.patch.yml'} }`、peer 仅 `@deepseek-ai/cordis@^4.0.2`、deps（`zod` + `@deepseek-ai/schemastery`，后者是 Config schema 的运行时依赖）、dev deps（cordis/react/@types/react/@types/node/esbuild/typescript）。

**浏览器束契约**（`scripts/build.mjs` 调用 **esbuild CLI**，复刻仓库 preset 的输出形状；参照 `apps/web/tests/fixtures/plugins/fixture-live-client/`）：
- **为何用 CLI 而非 esbuild JS API**：JS API 通过管道 stdio 与编译器子进程通信，被 DSH 文件沙箱拒绝（`spawn EPERM`）；CLI 本身就是编译器，以继承 stdio 执行，无需管道派生，构建链路因此在沙箱内永久可用（见 `scripts/build.mjs` 顶部注释）。
- `format:'cjs'`、`platform:'browser'`、输出 `lib/client.js`；
- 包装 banner `window.__ModuleLoader__.load({ id: "personal-track", factory: (require) => {` / intro `var module = { exports: {} }; var exports = module.exports;` / footer `return module.exports; } });`
- external 仅冻结平台表：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`-ui-slots`、`-ui-primitives`、`-ui-dockkit`；其余内联；其他 `@deepseek-ai/*` 只许 `import type`。
- Node 半身：`lib/index.js`，ESM/node/es2024。

**加载**（二选一）：
- **持久安装（推荐，已被第三方插件实证）**：`dsh plugin --profile web add link:D:/Projects/personal-track` → CLI 的 reconcile 自动把包写进 profile 的 `dsh.profile.bundles`（**不要**手改 profile 的 `cordis.patch.yml`：同 id 重复行 = boot 失败）→ 用 `dsh --profile web --dump-config` 验证出现 `== personal-track` 层 → **重启一次** `dsh --profile web`。
- **临时 overlay**：`--patch` 是**启动器级**选项，必须写在应用参数之前：`dsh --profile web --patch D:/Projects/personal-track/dev.patch.yml`（写成 `dsh web --patch …` 会被转发给 web 应用并报 `unknown option '--patch'`）。
- **patch 行两条对齐铁律**（来自第三方插件 `dsh-better-workspaces` 的实测注释）：`name` 必须是包名（Loader 据此从 profile 的 `node_modules` 解析代码）；`id` 必须等于宿主半身导出的 `name`。本插件三条（包名 / `name` / `id`）均为 `personal-track`。
**HMR**：仓库内 `dev:web` 不看本仓库，但宿主对每个已服务 bundle 做 ~500ms stat 轮询 → 本地 `pnpm watch`（esbuild CLI `--watch`）重写 `lib/client.js` 即自动热替换（React 状态会重置）。

⚠️ 当前会话就跑在 `dsh web` 里：**重启 profile 会重启本 GUI/会话**，正式安装安排在工作间隙。调试期可用启动器级 `--patch` overlay（见上）；注意这个版本的 web 应用**没有 `--port` 标志**（端口来自 webserver 行的 config），所以"另起一个实例换端口"需要一条覆盖该行 config 的 patch（patch 是整行替换、不深合并，必须重述全部键）。`dsh plugin add`/写 `~/.dsh` 在沙箱外，需批准放行。

## 7. 里程碑

| 里程碑 | 内容 | 验收 |
|---|---|---|
| **M0 骨架** | 脚手架、双 tsconfig、esbuild CLI 双产物、host `/habit/api` 占位路由、client 最小 tab | 已实证：类型检查双绿、包装契约逐字正确、bundle 经 facade 可执行、`/habit/api` 在**真实 socket** 上应答；待验：dsh 接受该包 + 浏览器渲染 |
| **M1 数据层** | domain schema（§2 全量）、daykey、derive 派生函数、API 读写、单元测试 | 打卡 → `~/.dsh/storages/habit/days/*.json` 正确；派生函数测试全绿 |
| **M2 看板·日常饮食** | DateNav/夜段/chip、洗漱·洗澡·洗衣（含洗完会话与修正）、三餐、补卡 | 点按全流程可用，历史日可改 |
| **M3 看板·学习健身** | 背单词（目标/进度/继承）、多邻国（存在目标）、跑步/跳绳/引体/器材 | 同上，会话可改可删 |
| **M4 登记** | 媒体、任务（进度编辑、三态派生、硬删除） | 同上 |
| **M5 统计** | 主面板 + 聚合 + 热力网格 + 三块指标 + **心率-配速曲线** | 周/月数字与手算一致；曲线同配速心率趋势可读 |
| **M6 收尾** | zh/en 文案、错误态、README、正式安装、git 提交 | 重启后开箱即用 |

## 7.5 交付状态（M0–M7 已完成并各自验证）

每个里程碑都对应一笔提交，验证脚本与断言随代码一起入库。

| 里程碑 | 提交 | 状态 |
|---|---|---|
| **M0 骨架** | `22f2683` | ✅ 已在 GUI 中目视确认：右侧栏出现「习惯看板」入口与标签页 |
| **M1a 数据层** | `ec5d9e0` | ✅ 34 项数据层断言（习惯日算法、夜段、时区、往返不变量、8 格、目标与超额、任务三态与逾期、配速、连续与补卡重算） |
| **M1b 存储与 API** | `6f071f5` | ✅ 真实 storage 中枢 + json 后端 + domain facility + webserver 的端到端；含磁盘真身检查与重启重读 |
| **M2 看板·日常饮食** | `9dba117` | ✅ 日期导航/夜段/完成度 chip/洗漱·洗澡·洗衣/三餐/补卡 |
| **M3 学习与健身** | `2a86628` | ✅ 会话增改删统一原语；背单词目标、多邻国、跑步/跳绳/引体/器材 |
| **M3.5 可编辑时间 + 看板化改版** | `0c08c1b` `a0c2f17` | ✅ 任意打卡时间可改（夜段归属由宿主换算）；网格卡片、环形进度、三档按钮 |
| **M4 登记** | `4f0bf5f` | ✅ 影视书籍与任务作业；PATCH 显式 null 清空；完成时刻自动维护 |
| **M5 统计面板** | `47cb696` | ✅ 主区域内整页统计：热力图、汇总卡、**心率-配速曲线**（手写 SVG） |
| **M6 文档与交付** | `a763a2c` | ✅ README/PLAN；`ctx.layout` 漏写 inject 的修复见 `dfa6dec` |
| **M7 反馈一轮** | 见提交 | ✅ 八条反馈：去掉「每日重置」字样与分类筛选；打卡改为「记录 + 虚线空槽」；洗澡并入打卡卡；三餐改紧凑行；背单词复习词按 1/5 加权；统计页三餐只留早饭与总花费；**导出/导入**（事实文件 + 合并/覆盖两种导入） |

自动化验证入口：`pnpm typecheck`（双程序）、`pnpm test`（37 项数据层断言）、
`pnpm verify`（客户端 facade：包装契约/四个注册面/24 个命令 + 宿主 16 阶段真实栈端到端，
含"导出→空根导入→重算→合并/覆盖/坏文件拒绝"）。

### 尚未完成 / 需要在你的环境确认

| 项 | 说明 |
|---|---|
| **重启后的目视验收** | 宿主半身只在 `dsh` 重启时替换；M7 的导出/导入与三餐投影需要你重启一次 `dsh --profile web` 再看 |
| **zh/en 双语文案** | 目前界面文案为中文硬编码。抽出 locale 命名空间需要遍历全部组件并在注册处传 `locale`，属机械改动；对单人中文使用场景收益有限，**按需再做** |
| **正式安装** | `dsh plugin --profile web add link:D:/Projects/personal-track` + 重启（README 有完整步骤） |

### M0 的原始实证结果（保留）

| 验证项 | 手段 | 结果 |
|---|---|---|
| 双半身类型检查 | `pnpm run typecheck`（两个独立程序） | ✅ 零错误 |
| 包装契约 | 静态比对 banner/intro/footer 与平台模块表 | ✅ 逐字一致；运行时 `require` 仅 `react` / `react/jsx-runtime` |
| bundle 可执行 | `scripts/verify-client.mjs`：伪造 `window.__ModuleLoader__` + 平台 `require`，真实物化工厂并对假 ctx 跑 `apply` | ✅ 导出与四个注册面均符合预期 |
| 宿主端到端 | `scripts/verify-host.mjs`：挂真实 `@deepseek-ai/dsh-host-webserver`（OS 分配端口）+ 真实 Cordis，真 HTTP 请求 | ✅ 15 个阶段全绿 |
| dsh 接受该包 | 启动器级 `--patch` 或 `dsh plugin add link:` + 重启 | ✅ 已在 GUI 中确认（M0 时） |
| 浏览器渲染 | 待做：GUI 里目视 guide 入口与 tab | ⏳ |

**沙箱约束（已解决，记录以免重踩）**：esbuild 的 JS API 以管道 stdio 派生编译器子进程，被沙箱拒绝（`spawn EPERM`）→ 构建改为直接调用原生 CLI（继承 stdio）。pnpm 11 的构建许可写在 `pnpm-workspace.yaml` 的 `allowBuilds`（package.json 的 `pnpm` 字段已失效），且 esbuild 的 postinstall 设为 `false`（我们直接调用二进制，不需要它）。

## 8. 测试

**测试策略（已按沙箱现实定案）**：**不用 vitest** —— vite/vitest 经 esbuild JS API 转换 TS，其管道派生被文件沙箱拒绝；改用 **Node 24 原生类型剥离**（`node tests/*.test.ts`），进程内执行、零测试工具链。宿主用例：daykey（03:59/04:00、时区覆盖、跨月跨年）、schema 默认值、chip=8 计数、目标进度与超额、任务三态与逾期、配速、洗涤联动（扣存量+会话）、streak（空白天中断、补卡重算）、stats 聚合、API handler、domain 读写（json 后端 tmp 目录）。客户端：facade 冒烟（`scripts/verify-client.mjs`）。

## 9. 明确出范围（v1）

秒级跑步采样与设备导入 · 任务子项清单 · 循环任务 · 书籍页数进度 · 图表库与折线图（跑步曲线除外）· 模型可见工具（AI 不可读写数据）· 云同步/多设备 · 软删除 · 日级删除 · 平均用餐时刻/单次极值/器材容量统计 · 目标编辑 UI 之外的"默认值设置"界面（由向前继承替代）。

## 10. 风险与对策

1. **手写浏览器束格式**（preset 不发布）→ 逐字包装契约 + 仓库内活体 fixture 对照；M0 首要验证，失败退化为 esbuild 手脚本。
2. **会话寻址**：所有数组条目带稳定 `id`（编辑/删除不靠下标），避免并发/补卡时的错位。
3. **json per-record**：每日一文档、原子写、~2-4KB/天；写频高时可经 profile `routes` 切 sqlite，代码不变。
4. **版本对齐**：以已安装 dsh 0.1.5-rc.2 为目标；dsh 升级后重跑 `dsh plugin add`。
5. **右侧栏会话域**：数据走全局 HTTP API，仅视图状态随会话；刷新后栏收起是产品行为（内存布局），guide 一键重开。
6. **统计与看板互斥显示**：主面板激活时右侧栏隐藏——按现状接受；若日后要同屏，把统计也做成右侧栏第二个 tab（数据源相同，改动小）。
7. **HMR 重置组件状态**：开发期接受；正式使用时无影响。
