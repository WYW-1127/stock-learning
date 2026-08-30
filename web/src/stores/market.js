// 行情 store — 指数/自选/报价统一轮询(5s,页面隐藏暂停),盘后状态
import { defineStore } from 'pinia';
import { api } from '../api.js';

const POLL_MS = 5000;

export const useMarketStore = defineStore('market', {
  state: () => ({
    status: { mode: 'live', tradeDate: null },
    indices: [],
    watchlist: [],
    quotes: {}, // symbol → quote
    quotesError: false,
    quoteTime: null, // 最近一次成功拉取时间(降级横幅用)
    _timer: null,
  }),
  actions: {
    async init() {
      await this.refreshStatus();
      await Promise.all([this.loadIndices(), this.loadWatchlist()]);
      await this.pollQuotes();
      this.startPolling();
    },
    async refreshStatus() {
      try { this.status = await api.getStatus(); } catch {}
    },
    async loadIndices() {
      try {
        const r = await api.getIndices();
        this.indices = r.indices || [];
      } catch {}
    },
    async loadWatchlist() {
      try {
        const r = await api.getWatchlist();
        this.watchlist = r.watchlist || [];
      } catch {}
    },
    // 拉指数+自选+当前页面临时关注的报价;失败置降级标志,不清空旧数据
    async pollQuotes(extraSymbols = []) {
      const symbols = [...new Set([...this.indices.map((i) => i.symbol), ...this.watchlist, ...extraSymbols])];
      if (!symbols.length) return;
      try {
        const r = await api.getQuotes(symbols);
        this.quotes = { ...this.quotes, ...r.quotes };
        this.quotesError = false;
        this.quoteTime = new Date();
      } catch {
        this.quotesError = true;
      }
    },
    startPolling() {
      this.stopPolling();
      const tick = () => {
        if (document.hidden) return; // 标签页隐藏时暂停
        this.pollQuotes(this._extra ?? []);
      };
      this._timer = setInterval(tick, POLL_MS);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) tick(); // 回到页面立即刷新一次
      });
    },
    stopPolling() {
      if (this._timer) clearInterval(this._timer);
      this._timer = null;
    },
    // 个股页把当前 symbol 挂进轮询(离开时清理)
    track(symbol) {
      this._extra = [...new Set([...(this._extra ?? []), symbol])];
      this.pollQuotes([symbol]);
    },
    untrack(symbol) {
      this._extra = (this._extra ?? []).filter((s) => s !== symbol);
    },
    async toggleWatch(symbol) {
      if (this.watchlist.includes(symbol)) {
        const r = await api.removeWatch(symbol);
        if (r.ok) this.watchlist = r.watchlist;
      } else {
        const r = await api.addWatch(symbol);
        if (r.ok) this.watchlist = r.watchlist;
        else alert(r.reason);
      }
    },
  },
});
