# AgentCrosstalk (`act`)

> **Agent-to-agent crosstalk, across your machines.**
> 一条命令，让这台电脑上的 Claude 指挥另一台电脑上的 Claude 干活、对比项目、私密传文件——零配置，不上云。

缩写即寓意：**A**gent **C**ross**T**alk = **ACT**——而 agent 的本质就是 act。

---

## ✨ 能干什么

- **`act talk`** —— 在 A 一句话，让 B 上的 Claude 干活（headless），结果实时流回 A
- **`act diff`** —— 对比两台机器上同一个项目的差异（不依赖 git）
- **`act send` / `act pull`** —— 点对点加密传文件（SFTP over SSH，不经任何云）
- **MCP server + slash 命令** —— 把上面这些接进 Claude Code，用自然语言或 `/talk`、`/diff` 调用

---

## 🚀 快速开始

### 前提（act 不打包这些，只检测 + 引导）

每台机器需要：
1. 在**同一个 ZeroTier 网络**里（[zerotier.com](https://www.zerotier.com) 免费）
2. 装好并登录 **Claude Code**（或设置 `ANTHROPIC_API_KEY`）
3. 一个 **ZeroTier Central 只读 token**：my.zerotier.com → Account → API Access Tokens

> Windows 下 `act init` 要在**管理员终端**跑（用来启用 OpenSSH 服务）；macOS/Linux 自行确保 sshd 在跑。

### 安装 + 初始化（每台机器各一次）

```bash
git clone <repo> AgentCrosstalk && cd AgentCrosstalk
npm install
npm run build

# 在每台机器上跑一次（token 也可以放进 ZEROTIER_API_TOKEN 环境变量）
node dist/cli.js init --zerotier-token <你的token>
```

`act init` 会自动：探测 ZeroTier 成员 → 生成 SSH 密钥 → 启用 sshd → 检查 claude/croc → 写配置。

### 第一次用

```bash
node dist/cli.js peers                         # 看看网络里有哪些机器
node dist/cli.js talk 游戏本 "列一下你的桌面"   # 指挥另一台的 Claude
```

> 两台机器第一次互联时，`act talk` 会提示输一次对方密码来安装本机公钥，之后免密。

---

## 🛠 命令

| 命令 | 作用 |
|------|------|
| `act init [--zerotier-token <t>] [--zerotier-network <id>]` | 每台机器跑一次：组网 + SSH + 写配置 |
| `act peers [--json]` | 列出 ZeroTier 网络里的机器 |
| `act talk <host> "<任务>" [--output-format text\|json]` | 让 `<host>` 上的 Claude 执行任务，结果流回（默认 `bypassPermissions`，可改） |
| `act diff <host> [--path <dir>] [--remote-path <dir>]` | 跨机对比项目，列出 added / removed / modified |
| `act send <file> to <host> [--to <dir>]` | 发文件到对方（落到对方 home 或 `--to`） |
| `act pull <file> from <host> [--out <dir>]` | 从对方拉文件到本机 |

`<host>` 可以是机器名、ZeroTier IP 或 nodeId，支持模糊匹配（`act talk 游戏本 ...` 即可）。

---

## 🔌 接进 Claude Code（MCP）

```bash
claude mcp add act -- node /绝对路径/dist/mcp-server.js
```

重启 Claude Code 后，`act` 的 5 个工具就可被原生调用：`act_peers` / `act_talk` / `act_diff` / `act_pull` / `act_send`。也可以用 slash 命令：`/peers`、`/talk <host> <任务>`、`/diff <host>`、`/pull <host> <文件>`。

最大好处：**跨机的多步活儿，Claude 自己编排**。比如"把游戏本上的某项目拉过来开发"，Claude 会自动串联 talk→pull→解压，不用你一步步盯。

---

## ⚙️ 工作原理

```
  机器 A (act)          ZeroTier           机器 B
     │                     │                  │
     │── SSH (免密) ──────►│──────────────────►│  claude -p "<任务>"
     │                     │  (点对点加密)     │
     │◄── 结果流回 ────────│◄──────────────────│
     │                                         │
     │── SFTP (传文件) ────►│──────────────────►│
```

- **组网**：ZeroTier（Central API 自动发现成员，不用手填 IP）
- **执行**：SSH 进对方，跑 headless `claude -p`，结果流式回传
- **传文件**：SFTP over SSH——复用已建通道，端到端加密、不经云
- **协议**：MCP，让 Claude Code 原生调用

> 传输最初打算用 croc，但 croc 在 SSH 自动化场景水土不服（非 TTY 时把 stdin 当数据源、加 PTY 又改了 shell 解析）。既然 act 已经建好了 SSH 通道，直接用 SFTP 更稳、更简单。

---

## 🗺 路线图与状态

🎉 **MVP 完成**，A↔B 两台真机端到端验证通过。

- [x] **M0** 脚手架 + 构建链（CLI / MCP 双 bin、tsup、单测）
- [x] **M1** `act init` + `act peers`（ZeroTier Central API 发现）
- [x] **M2** `act talk`（SSH + headless Claude）
- [x] **M3** `act diff`（跨机项目对比）
- [x] **M4** `act send` / `act pull`（SFTP over SSH）
- [x] **M5** MCP server + slash 命令（5 工具，Claude 原生调用）
- [ ] **`act mesh`** 多机 Claude 互联（agent-as-tool）
- [ ] `act pull <目录>`（整项目迁移，目前需手动打包）
- [ ] 单文件 `.exe` 分发、安装脚本、首页

---

## 🧩 设计原则

1. **零配置** —— `act init` 一条命令搞定一切，对手是"自己折腾两小时"。
2. **私有优先** —— 默认端到端加密、不经过任何云存储。
3. **Claude 原生** —— 做成 MCP server + slash command，在 Claude Code 里无缝用。
4. **不重造轮子** —— 组网用 ZeroTier、传输走 SFTP、协议靠 MCP、agent 用 Claude。价值在编排 + DX + 安全默认值。

---

## 🛠 开发

```bash
npm install        # 装依赖
npm run build      # tsup 打包 → dist/cli.js + dist/mcp-server.js
npm test           # vitest 单测
npm run typecheck  # tsc --noEmit
npm run dev -- --version   # tsx 直接跑 CLI
```

技术栈：**TypeScript**（ESM / Node 20+），单包双 bin（`act` CLI + `act-mcp`），Commander + ssh2 + fast-glob + zod + `@modelcontextprotocol/sdk`。

---

## 📄 License

MIT
