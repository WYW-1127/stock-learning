// 内容 store — 术语表(术语卡共用)+ 课程列表
import { defineStore } from 'pinia';
import { api } from '../api.js';

export const useContentStore = defineStore('content', {
  state: () => ({
    terms: [],
    lessons: [],
    loaded: false,
  }),
  actions: {
    async ensureTerms() {
      if (this.terms.length) return;
      try {
        const r = await api.getTerms();
        this.terms = r.terms || [];
      } catch {}
    },
    async ensureLessons() {
      if (this.lessons.length) return;
      try {
        const r = await api.getLessons();
        this.lessons = r.lessons || [];
      } catch {}
    },
    // 按词条词面查找(如"换手率");找不到返回 null
    findTerm(word) {
      return this.terms.find((t) => t.term === word) || null;
    },
  },
});
