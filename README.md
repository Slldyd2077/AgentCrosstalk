# AgentCrosstalk

> **Agent-to-agent crosstalk, across your machines.**
> 让多个 Claude / AI agent 跨多台个人电脑互联、协作、私密流转文件——零配置，不上云。

---

## 💡 为什么做这个

一个人有几台电脑（家里 / 办公 / 笔记本），各自存着不同的数据、装着不同的 MCP / skills。
想在 A 机器上一句话，就指挥 B 机器上的 Claude 干活、搞清楚两台机器上项目的差异、让 B 点对点把私密文件发回 A——

而**不用**自己折腾 ZeroTier + SSH + croc + MCP 四件套，也**不用**把不能公开的差异推上 GitHub。

`act` 把这一切封装成一条命令。

缩写即寓意：**A**gent **C**ross**T**alk = **ACT**（行动）——而 agent 的本质就是 act。

---

## 🛠 命令草稿（CLI：`act`）

| 命令 | 作用 |
|------|------|
| `act init` | 每台机器跑一次，自动组网 + 配 SSH + 配点对点传输 |
| `act talk <host> "<任务>"` | 让目标机器上的 Claude 干活（SSH + headless） |
| `act diff <host>` | 跨机 diff 项目，列出差异（解决"两台机器差在哪"） |
| `act send <file> to <host>` / `act pull <file> from <host>` | 点对点传文件，默认端到端加密、不经云 |
| `act mesh` | 把当前 Claude Code 连上其他机器的 Claude（MCP 互联） |

---

## 📐 四条原则

1. **零配置** —— `act init` 一条命令搞定一切。对手是"用户自己折腾两小时"。
2. **私有优先** —— 默认端到端加密、不经过任何云存储。GitHub 私有仓库都给不了的承诺。
3. **Claude 原生** —— 做成 MCP server + slash command，在 Claude Code 里无缝用，而不是又一个要切出去的终端工具。
4. **不重造轮子** —— 组网用 ZeroTier、传输走 SFTP over SSH、协议靠 MCP / A2A、agent 用 Claude。价值在编排 + DX + 安全默认值。

---

## 🧱 技术栈决策（暂定）

| 能力 | 用现成 | 不自己写 |
|------|--------|----------|
| 组网 | ZeroTier（Central API 自动发现成员） | VPN |
| 点对点传输 | SFTP over SSH（复用已建通道，端到端加密、不经云） | 自研传输 / croc |
| agent 间协议 | MCP / A2A | 新协议 |
| agent 本体 | Claude Code / Agent SDK | 新 agent |

**实现语言**：TypeScript（ESM / Node 20+；CLI 与 MCP server 同一个包、两个 bin）。

> 传输最初打算用 croc，但 croc 在 SSH 自动化场景下水土不服（非 TTY 时会把 stdin 当数据源、加 PTY 又改了 shell 解析）。既然 `act` 已经建好了 SSH 通道，直接用 SFTP 更稳、更简单、同样端到端加密、不经云。

---

## 🗺 路线图

- [x] **MVP**：`act init` + `act talk` + `act diff` + `act pull` 能在两台机器上跑通
  - [x] M0 脚手架 + 构建链（CLI / MCP 双 bin、tsup、单测框架）
  - [x] M1 `act init` + `act peers`（已实现 + 单测 + 真机验证 ✅，走 ZeroTier Central API）
  - [x] M2 `act talk`（SSH 远程 headless Claude，A→B 两台真机验证 ✅）
  - [x] M3 `act diff`（跨机项目 diff，A↔B 真机验证 ✅）
  - [x] M4 `act send` / `act pull`（SFTP over SSH，双向真机验证 ✅）
- [x] **MCP server（M5）**：5 个工具（peers/talk/diff/pull/send）+ slash 命令，真机验证 ✅
- [ ] **`act mesh`**：多机 Claude 互联（agent-as-tool）
- [ ] 文档、安装脚本、首页

## 🛠 开发

实现语言：**TypeScript**（ESM / Node 20+）。

```bash
npm install        # 装依赖
npm run build      # tsup 打包 → dist/cli.js + dist/mcp-server.js
npm test           # vitest 单测
npm run typecheck  # tsc --noEmit
npm run dev -- --version   # tsx 直接跑 CLI
```

外部前提（act 不打包，只检测+引导）：每台机器已在同一个 **ZeroTier** 网络、装好 **croc**，以及登录好的 **Claude Code**（或 `ANTHROPIC_API_KEY`）。`act init` 用一个 ZeroTier Central 只读 token（my.zerotier.com → Account → API Access Tokens）自动发现成员。Windows 下 `act init` 需在管理员终端运行（用来启用 OpenSSH 服务）。

### 接进 Claude Code（MCP）

```bash
claude mcp add act -- node E:\AgentCrosstalk\dist\mcp-server.js
```

之后 Claude Code 里就能直接用自然语言指挥另一台机器，或用 slash 命令：`/peers`、`/talk 游戏本 <任务>`、`/diff 游戏本`、`/pull 游戏本 <文件>`。MCP 工具：`act_peers` / `act_talk` / `act_diff` / `act_pull` / `act_send`。

## 📌 状态

🎉 **MVP 完成** —— M0–M5 全部 ✅，A↔B 两台真机端到端跑通（init/peers/talk/diff/send/pull + MCP 工具）。

## 📄 License

MIT
