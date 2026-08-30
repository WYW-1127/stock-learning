// 账户 store — 概览(现金/持仓/总资产)+ 成交后刷新
import { defineStore } from 'pinia';
import { api } from '../api.js';

export const useAccountStore = defineStore('account', {
  state: () => ({
    loaded: false,
    account: { cash: null, initialCash: null },
    positions: [],
    totalAssets: null,
    marketOk: true,
  }),
  getters: {
    cash: (s) => s.account.cash,
    totalPnl: (s) =>
      Number.isFinite(s.totalAssets) && Number.isFinite(s.account.initialCash)
        ? Math.round((s.totalAssets - s.account.initialCash) * 100) / 100
        : null,
    positionOf: (s) => (symbol) => s.positions.find((p) => p.symbol === symbol) || null,
  },
  actions: {
    async refresh() {
      try {
        const r = await api.getAccount();
        if (r.ok) {
          this.account = r.account;
          this.positions = r.positions;
          this.totalAssets = r.totalAssets;
          this.marketOk = r.marketOk;
          this.loaded = true;
        }
      } catch {}
    },
    async reset() {
      await api.resetAccount();
      await this.refresh();
    },
  },
});
