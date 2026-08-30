// 本地 JSON 文件存储 — 五份数据:account / positions / trades / watchlist / snapshots
// 写入策略:先把旧文件复制为 .bak,再写 .tmp,最后 rename 原子覆盖(任何时刻断电都不会出现半截 JSON)
// 启动恢复:init() 发现主文件损坏时从 .bak 恢复,.bak 也不可用则回退默认值,并通过返回值把情况告知上层
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const INITIAL_CASH = 100000;
// 自选默认两只常见股,方便首屏不为空;重置账户时自选保留(与账户无关)
const DEFAULT_WATCHLIST = ['sh600519', 'sz000001'];

function defaultAccount() {
  return { initialCash: INITIAL_CASH, cash: INITIAL_CASH, createdAt: new Date().toISOString() };
}

// Windows 上 rename 覆盖已有文件偶发 EPERM(杀毒/索引器短暂占用目标),小幅重试兜底
function renameWithRetry(tmp, target, tries = 3) {
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(tmp, target);
      return;
    } catch (err) {
      if (i >= tries - 1) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}

export function createStore(dataDir) {
  const fileOf = (name) => path.join(dataDir, `${name}.json`);

  function writeJson(name, data) {
    fs.mkdirSync(dataDir, { recursive: true });
    const file = fileOf(name);
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    renameWithRetry(tmp, file);
  }

  // 读单文件:缺失→落默认值;损坏→先试 .bak,再不行回退默认;返回 { data, notice? }
  // notice.action: 'restored-from-bak' | 'reset-to-default',供上层提示用户
  function readJson(name, makeDefault) {
    const file = fileOf(name);
    if (!fs.existsSync(file)) {
      const data = makeDefault();
      writeJson(name, data);
      return { data };
    }
    try {
      return { data: JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch {}
    const bak = `${file}.bak`;
    if (fs.existsSync(bak)) {
      try {
        const data = JSON.parse(fs.readFileSync(bak, 'utf8'));
        writeJson(name, data); // 用备份重写主文件
        return { data, notice: { file: `${name}.json`, action: 'restored-from-bak' } };
      } catch {}
    }
    const data = makeDefault();
    writeJson(name, data);
    return { data, notice: { file: `${name}.json`, action: 'reset-to-default' } };
  }

  const defaults = {
    account: () => defaultAccount(),
    positions: () => ({}),
    trades: () => [],
    watchlist: () => [...DEFAULT_WATCHLIST],
    snapshots: () => ({}),
  };

  const load = (name) => readJson(name, defaults[name]).data;

  // 启动初始化:确保目录与五个文件就绪;返回损坏恢复提示列表
  function init() {
    const notices = [];
    for (const name of Object.keys(defaults)) {
      const { notice } = readJson(name, defaults[name]);
      if (notice) notices.push(notice);
    }
    return notices;
  }

  return {
    init,
    // 账户:{ initialCash, cash, createdAt }
    getAccount: () => load('account'),
    saveAccount: (account) => writeJson('account', account),
    // 持仓:symbol → { symbol, name, board, lots: [{ qty, date, cost }] }
    getPositions: () => load('positions'),
    savePositions: (positions) => writeJson('positions', positions),
    // 成交流水:追加式数组;带 limit 时取最近 N 笔、最新在前
    getTrades: (limit) => {
      const all = load('trades');
      return limit ? all.slice(-limit).reverse() : all;
    },
    addTrade: (trade) => {
      const all = load('trades');
      all.push(trade);
      writeJson('trades', all);
    },
    // 自选:symbol 数组
    getWatchlist: () => load('watchlist'),
    saveWatchlist: (list) => writeJson('watchlist', list),
    // 资产快照:date('YYYY-MM-DD') → 当日总资产
    getSnapshots: () => load('snapshots'),
    setSnapshot: (date, equity) => {
      const all = load('snapshots');
      all[date] = equity;
      writeJson('snapshots', all);
    },
    // 重置:账户回初始 10 万,清空持仓/流水/快照;自选保留
    reset: () => {
      writeJson('account', defaultAccount());
      writeJson('positions', {});
      writeJson('trades', []);
      writeJson('snapshots', {});
    },
  };
}

// 默认实例:仓库根 data/ 目录,环境变量 DATA_DIR 可覆盖(测试/多套数据用)
export const store = createStore(process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data'));
