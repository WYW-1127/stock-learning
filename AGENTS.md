# AI 协作约定(AGENTS.md)

本文件会被 AI 编码代理在每次会话自动加载。在本仓库工作前,必须遵守以下约定。

## 会话开始(必做)

1. **先读 `docs/project-state.md`** — 进度、下一步、待办全在里面,这是唯一进度真相源
2. 按需读 `docs/requirements.md`(做什么)与 `docs/architecture.md`(怎么做、环境坑)
3. 不要凭空重推已有决策;有疑问先查文档,再问用户

## 会话结束(必做)

1. **更新 `docs/project-state.md`**:勾掉完成项、写明下一步的精确入口(做到哪、怎么继续)、记录新决策与新坑
2. git commit + push
3. 向用户总结:做了什么、下一步是什么

## 交接纪律

- 本项目跨多个会话开发,会话内的 todo 列表不持久,**一切以 project-state.md 为准**
- 长任务中途必须停时,把"进行到哪、如何继续"写进 project-state.md 再结束,不允许留悬空状态

## 语言与提交

- 与用户交流、文档、代码注释一律**中文**
- commit 格式 `类型: 摘要`,类型:`docs:` / `design:` / `feat:` / `fix:` / `test:` / `chore:` / `refactor:`

## 技术约定(细节见 docs/architecture.md)

- 后端 Node.js≥20 + Express;前端 Vue 3 + Vite + Pinia + klinecharts
- **交易引擎必须纯函数 + vitest 全量单测**;动引擎先跑测试,测试不过不提交
- 金额逐项四舍五入到分,禁止裸浮点累加
- 本地存储用临时文件 + rename 原子写
- UI 以 `design/stitch/*.jpg` 为视觉基准(红涨绿跌、朱红主色、等宽数字);不照搬 Stitch 生成的 HTML 框架

## 环境备忘(Windows,详细见 docs/architecture.md §8)

- Git Bash;系统代理 127.0.0.1:7897,**只有** Google/Stitch 流量需要走代理,行情接口直连
- Node 22 fetch 不认代理:访问 Stitch 必须加 `NODE_OPTIONS="--require C:/Users/wangy/.zcode/stitch-proxy/proxy-boot.cjs"` + `HTTPS_PROXY`
- Stitch 一键包装:`bash C:/Users/wangy/.zcode/stitch-proxy/stitch.sh <命令>`

## 红线

- 任何密钥/token 不入库(Stitch key 在仓库外 `~/.zcode`),不在输出中显示密钥
- 不手工编辑 `data/` 下的运行时数据
- 仓库保持私有,公开前必须征得用户同意
