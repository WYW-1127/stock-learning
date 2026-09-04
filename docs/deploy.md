# 部署指南(Docker)

把本项目打包成 Docker 镜像部署到云服务器,公网访问 + 口令保护(Basic Auth),数据落在宿主机目录。

## 镜像里有什么

| 层 | 内容 |
|---|---|
| 基础镜像 | `node:22-alpine`(约 180MB) |
| 应用 | server 源码 + 生产依赖(express、iconv-lite)+ 前端 dist + content 课程/术语 |
| 时区 | `TZ=Asia/Shanghai`(盘中/盘后与交易日判定依赖北京时间,勿改) |
| 数据目录 | `/data`(账户/持仓/流水/自选/快照全部 JSON) |
| 端口 | 8090 |

访问保护:环境变量 `AUTH_USER` + `AUTH_PASS` 都非空时启用 HTTP Basic Auth(浏览器弹原生登录框,输一次记住);不配则不启用,与本地行为一致。`/api/meta/status` 免口令,专供健康检查。

---

## 前置要求

- 云服务器:Linux x86_64,已装 Docker(含 compose 插件):
  `curl -fsSL https://get.docker.com | bash` 并 `sudo systemctl enable --now docker`
- 安全组/防火墙放行 TCP 8090(或你映射的端口);22 端口保持只给自己 IP
- 国内服务器拉不动 Docker Hub 时,先给 Docker 配镜像加速(见文末常见问题),或直接用路线 B

## 路线 A:服务器上拉代码构建(推荐,更新方便)

```bash
# 1. 克隆私有仓库(首次需 GitHub 凭据:用 Personal Access Token 当密码,或配好 ssh key)
git clone https://github.com/WYW-1127/stock-learning.git
cd stock-learning

# 2. 配置口令与 AI 密钥
cp .env.example .env
vim .env          # 至少填 AUTH_USER / AUTH_PASS;ZHIPU_API_KEY 想用 AI 教练就填

# 3. 准备数据目录并授权给容器内 node 用户(uid 1000)
mkdir -p data && sudo chown -R 1000:1000 data

# 4. 构建并启动(后台,开机自启)
docker compose up -d --build

# 5. 验证
curl http://127.0.0.1:8090/api/meta/status   # 期望 {"ok":true,...}
```

浏览器打开 `http://服务器IP:8090`,输入 .env 里的账号密码即用。

**以后更新版本**:

```bash
git pull && docker compose up -d --build   # 数据在 ./data,不受影响
```

## 路线 B:本机构建镜像,打包搬运(服务器无需 GitHub 凭据)

本机(Windows,Docker Desktop)执行:

```bash
docker build -t stock-learning:latest .
docker save stock-learning:latest | gzip > stock-learning-image.tar.gz
scp stock-learning-image.tar.gz user@服务器IP:~/
```

服务器上执行:

```bash
docker load < ~/stock-learning-image.tar.gz     # 还原出 stock-learning:latest
# 把仓库里的 docker-compose.yml 与 .env.example 传过去(只需这两个文件,不必 clone)
mkdir -p ~/stock-learning && cd ~/stock-learning
# 上传 docker-compose.yml 后:
cp .env.example .env && vim .env
mkdir -p data && sudo chown -R 1000:1000 data
docker compose up -d        # 镜像已在本地,不会再 build,秒起
```

> 以后版本更新:本机重新 build + save + scp,服务器 `docker load` 后 `docker compose up -d`。

> 注:本机构建产物是 linux/amd64。若服务器是 ARM(如部分国产云主机),请改用路线 A 在服务器上构建。

## .env 配置项

| 变量 | 必填 | 说明 |
|---|---|---|
| `AUTH_USER` / `AUTH_PASS` | 公网部署必填 | 网页登录口令(Basic Auth);两个都留空 = 关闭鉴权,仅限本机/内网时这样用 |
| `ZHIPU_API_KEY` | 可选 | 智谱 AI 教练;留空则 AI 功能提示未配置,其余功能不受影响 |
| `AI_MODEL` | 可选 | 默认 `glm-5.3-flash`;免费 `glm-4.7-flash`,最强 `glm-5.3` |

`.env` 已被 .gitignore 忽略,**严禁提交仓库或发给别人**(密钥红线)。

## 日常运维

```bash
docker compose ps                # 状态(health 从 starting 变 healthy 即正常)
docker compose logs -f app       # 看日志
docker compose restart           # 重启
docker compose down              # 停止(数据保留在 ./data)
docker compose up -d --build     # 改代码/配置后重建
```

**数据备份**:停服后打包宿主机 `data/` 目录即可(`tar czf backup-$(date +%F).tar.gz data/`),恢复 = 解包回 `data/` 再启动。

**数据在容器里的位置**:/data(account/positions/trades/watchlist/snapshots .json,损坏自动从 .bak 恢复)。

## 安全建议(公网部署)

1. **强密码**:.env 里 AUTH_PASS 用 16 位以上随机串, 不要复用旧密码
2. **防火墙收敛**:安全组只放行 8090 与 22(22 限自己 IP)
3. **有域名强烈建议上 HTTPS**:Basic Auth 密码是明文 base64 传输,HTTP 下可被链路窃听。最快方案是在服务器上加一个 Caddy 反代(自动签发证书),compose 里去掉 8090 的公网映射、只留 Caddy 的 443:

   ```yaml
   # 追加到 docker-compose.yml 的 services: 下
     caddy:
       image: caddy:2-alpine
       restart: unless-stopped
       ports: ["80:80", "443:443"]
       volumes:
         - ./Caddyfile:/etc/caddy/Caddyfile
         - caddy_data:/data
       depends_on: [app]
   volumes:
     caddy_data:
   ```

   `Caddyfile`(把域名换成你的,并注意 DNS 已解析到服务器):

   ```
   stock.example.com {
       reverse_proxy app:8090
   }
   ```

   同时把 app 的 `ports: ["8090:8090"]` 改成 `expose: ["8090"]`(不对公网暴露),访问方式变为 `https://stock.example.com`。

## 常见问题

- **服务器拉不动 node:22-alpine**(Docker Hub 被墙):配镜像加速,编辑 `/etc/docker/daemon.json`:

  ```json
  { "registry-mirrors": ["https://docker.m.daocloud.io"] }
  ```

  然后 `sudo systemctl restart docker`,重试。或改用路线 B。

- **容器反复重启,日志报 EACCES 写 /data**:宿主机 data 目录属主不是 uid 1000。执行 `sudo chown -R 1000:1000 data` 再 `docker compose up -d`。

- **行情失败/盘后判定不对**:确认容器没被改掉 `TZ=Asia/Shanghai`;行情走腾讯接口,国内服务器直连无需代理,境外服务器需实测可达性。

- **忘了口令**:改 .env 里 AUTH_PASS 后 `docker compose up -d`(重建容器即生效)。

- **本机(Windows)开发调试容器**:`docker run --rm -p 18090:8090 -e AUTH_USER=test -e AUTH_PASS=test stock-learning:latest`,访问 http://localhost:18090 ;本机拉基础镜像被墙时可先 `docker pull docker.m.daocloud.io/library/node:22-alpine` 再 `docker tag` 改名为 `node:22-alpine`。
