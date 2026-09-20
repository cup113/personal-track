# 树外插件用 Web 服务器路由承载自有 API，而不是 ctx.remote

DSH 惯用的 Host↔Client 通道是生成的 `ctx.remote.<namespace>`：宿主服务加 `@Remote` 装饰器，构建期产出严格描述符、运行时 codec 与客户端声明合并。但客户端**从不**从运行中的宿主发现装饰器——它的类型、codec 与注册值一律来自最近一次生成的 `lib/typert.remote-client.*`（`docs/api-gateway.md:137`），而那次生成以 **Host 聚合 tsconfig 作为唯一的 `ts.Program` 种子**（`:97`）。本插件位于 `D:\Projects\personal-track`，不在该程序内，因此 `ctx.remote.habit.*` 无从生成；运行时兜底（SRC 描述符）只解决宿主侧派发，客户端明确拒绝缺少严格 codec 的 SRC 描述符。我们因此改用 `ctx.webServer.register({ kind: 'prefix', path: '/habit/api' })` 注册自有 HTTP 路由，浏览器半身同源 `fetch` 读写。这不是绕开框架：webserver 的设计就是“除 `/api` 桥接、插件 bundle、HMR 事件流与 SPA dist 之外，每个功能路由都由插件自己注册”（`docs/subsystems/web-server.md:5`），api-gateway 亦明确要求“需要流式或浏览器原生响应的功能，注册精确 Fetch 路由而非 Remote 方法”（`:162`）。

- **Status**: accepted
- **Considered Options**
  - 生成式 `ctx.remote` 命名空间 —— 唯一被排除的方案，原因如上（客户端 codec 必须来自仓库内构建）。
  - 把插件搬进 DSH 单仓以换取 codegen —— 放弃独立仓库的开发节奏与版本自由，代价远大于收益。
  - 复用既有生成命名空间（如 `workspaceFiles`）承载数据 —— 语义不匹配，属于滥用他人接口。
- **Consequences**
  - 失去：类型化 RPC 的人机工程、统一失败词汇表、lookup 解析、Connection 在 `/api` 上的统一信任检查。
  - 补偿：宿主侧用 zod 校验（本就需要的依赖），失败形状统一为 `{ error: { code, message } }`，客户端一层薄 fetch 封装。
  - **该路由没有认证**。仅在 `dsh web` 绑定回环时安全（CLI 拒绝 `--host 0.0.0.0`）；若将来允许非回环绑定，这条路由立即成为暴露面。
  - 传输选择不影响数据模型：若插件日后迁入单仓，可升级为生成式 Remote 命名空间而无业务改动。
- **先例（独立印证）**：本机已安装并运行的第三方插件 `dsh-better-workspaces@0.2.0` 采用同一方案——宿主半身 `inject = ['webServer', 'workspaceRegistry']`，在 `/better-workspaces/api` 上以 HTTP + SSE 提供自有 API，浏览器半身同源 `fetch`。这不是孤例，而是树外插件在当前版本上的既有做法。
