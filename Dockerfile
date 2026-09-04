# 多阶段构建:阶段1 构建前端产物,阶段2 只带服务端生产依赖与 dist,镜像保持精简
# 构建上下文 = 仓库根:docker build -t stock-learning .

FROM node:22-alpine AS web-builder
WORKDIR /app
COPY web/package.json web/package-lock.json* ./web/
RUN npm --prefix web ci
COPY web/ web/
RUN npm --prefix web run build

FROM node:22-alpine
# TZ 必须为北京时间:服务端用本地时间判定盘中/盘后与交易日,容器默认 UTC 会全错
ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    DATA_DIR=/data \
    PORT=8090
RUN apk add --no-cache tzdata
WORKDIR /app
COPY server/package.json server/package-lock.json* ./server/
RUN npm --prefix server ci --omit=dev
COPY server/ server/
COPY --from=web-builder /app/web/dist web/dist
COPY content/ content/
VOLUME /data
EXPOSE 8090
# 数据卷目录预授权给 node 用户(uid 1000);bind mount 时宿主目录也需 chown 1000:1000(见 docs/deploy.md)
RUN mkdir -p /data && chown node:node /data
USER node
CMD ["node", "server/src/index.js"]
