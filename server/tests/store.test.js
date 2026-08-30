// store 单测:原子写、.bak 备份链、损坏恢复、追加流水、重置
// 每个用例用独立临时目录,绝不触碰仓库 data/
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../src/store.js';

let dir;
let store;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-test-'));
  store = createStore(dir);
});

const readRaw = (name) => fs.readFileSync(path.join(dir, `${name}.json`), 'utf8');
const fileExists = (name) => fs.existsSync(path.join(dir, `${name}.json`));
const trade = (id) => ({ id, symbol: 'sh600519', side: 'buy', qty: 100 });

describe('init 首次初始化', () => {
  it('创建五个默认文件,账户为初始 10 万,无恢复提示', () => {
    const notices = store.init();
    expect(notices).toEqual([]);
    for (const name of ['account', 'positions', 'trades', 'watchlist', 'snapshots']) {
      expect(fileExists(name)).toBe(true);
    }
    const account = store.getAccount();
    expect(account.initialCash).toBe(100000);
    expect(account.cash).toBe(100000);
    expect(account.createdAt).toBeTruthy();
    expect(store.getPositions()).toEqual({});
    expect(store.getTrades()).toEqual([]);
    expect(store.getWatchlist()).toEqual(['sh600519', 'sz000001']);
    expect(store.getSnapshots()).toEqual({});
  });

  it('重复 init 幂等:数据保留、无提示', () => {
    store.init();
    store.saveAccount({ initialCash: 100000, cash: 50000, createdAt: 'x' });
    const notices = store.init();
    expect(notices).toEqual([]);
    expect(store.getAccount().cash).toBe(50000);
  });
});

describe('原子写与备份', () => {
  it('写入后目录无 .tmp 残留,内容可解析', () => {
    store.saveAccount({ initialCash: 100000, cash: 1.23, createdAt: 'x' });
    const leftovers = fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
    expect(JSON.parse(readRaw('account'))).toEqual({ initialCash: 100000, cash: 1.23, createdAt: 'x' });
  });

  it('第二次写入前旧文件已复制为 .bak', () => {
    store.saveAccount({ initialCash: 100000, cash: 111, createdAt: 'v1' });
    store.saveAccount({ initialCash: 100000, cash: 222, createdAt: 'v2' });
    const bak = fs.readFileSync(path.join(dir, 'account.json.bak'), 'utf8');
    expect(JSON.parse(bak).cash).toBe(111);
    expect(JSON.parse(readRaw('account')).cash).toBe(222);
  });

  it('数据目录被删后写入能自动重建', () => {
    store.init();
    fs.rmSync(dir, { recursive: true });
    store.saveWatchlist(['sh600000']);
    expect(store.getWatchlist()).toEqual(['sh600000']);
  });
});

describe('损坏恢复', () => {
  it('主文件损坏且有备份:从 .bak 恢复并提示 restored-from-bak', () => {
    store.init();
    // 写两次,使 .bak 恰为 v1(cash 111);损坏 v2 后应恢复出 v1
    store.saveAccount({ initialCash: 100000, cash: 111, createdAt: 'v1' });
    store.saveAccount({ initialCash: 100000, cash: 222, createdAt: 'v2' });
    fs.writeFileSync(path.join(dir, 'account.json'), '{oops 半截 JSON');
    const notices = store.init();
    expect(notices).toEqual([{ file: 'account.json', action: 'restored-from-bak' }]);
    expect(store.getAccount().cash).toBe(111);
    // 主文件已被备份内容重写,可正常解析
    expect(JSON.parse(readRaw('account')).cash).toBe(111);
  });

  it('主文件损坏且无备份:回退默认值并提示 reset-to-default', () => {
    store.init();
    fs.writeFileSync(path.join(dir, 'positions.json'), 'not json at all');
    const notices = store.init();
    expect(notices).toEqual([{ file: 'positions.json', action: 'reset-to-default' }]);
    expect(store.getPositions()).toEqual({});
  });

  it('主文件与备份都损坏:回退默认值', () => {
    store.init();
    store.saveWatchlist(['sz000001']);
    fs.writeFileSync(path.join(dir, 'watchlist.json'), '???');
    fs.writeFileSync(path.join(dir, 'watchlist.json.bak'), '???');
    const notices = store.init();
    expect(notices).toEqual([{ file: 'watchlist.json', action: 'reset-to-default' }]);
    expect(store.getWatchlist()).toEqual(['sh600519', 'sz000001']);
  });
});

describe('成交流水', () => {
  it('addTrade 追加;getTrades 全量按时间正序', () => {
    store.addTrade(trade('t1'));
    store.addTrade(trade('t2'));
    store.addTrade(trade('t3'));
    expect(store.getTrades().map((t) => t.id)).toEqual(['t1', 't2', 't3']);
  });

  it('getTrades(limit) 取最近 N 笔且最新在前', () => {
    store.addTrade(trade('t1'));
    store.addTrade(trade('t2'));
    store.addTrade(trade('t3'));
    expect(store.getTrades(2).map((t) => t.id)).toEqual(['t3', 't2']);
  });
});

describe('快照', () => {
  it('setSnapshot 按日期记录并可读回', () => {
    store.setSnapshot('2026-08-28', 99500.5);
    store.setSnapshot('2026-08-29', 100120);
    expect(store.getSnapshots()).toEqual({ '2026-08-28': 99500.5, '2026-08-29': 100120 });
  });

  it('同日重复写入覆盖为当日最新值', () => {
    store.setSnapshot('2026-08-28', 99500.5);
    store.setSnapshot('2026-08-28', 100000);
    expect(store.getSnapshots()['2026-08-28']).toBe(100000);
  });
});

describe('重置', () => {
  it('账户回初始 10 万,清空持仓/流水/快照,自选保留', () => {
    store.init();
    store.saveAccount({ initialCash: 100000, cash: 1234.5, createdAt: 'x' });
    store.savePositions({ sh600519: { symbol: 'sh600519', lots: [{ qty: 100, date: 'd', cost: 1 }] } });
    store.addTrade(trade('t1'));
    store.setSnapshot('2026-08-28', 90000);
    store.saveWatchlist(['sz000001', 'sh600036']);

    store.reset();

    const account = store.getAccount();
    expect(account.cash).toBe(100000);
    expect(account.initialCash).toBe(100000);
    expect(store.getPositions()).toEqual({});
    expect(store.getTrades()).toEqual([]);
    expect(store.getSnapshots()).toEqual({});
    expect(store.getWatchlist()).toEqual(['sz000001', 'sh600036']);
  });
});
