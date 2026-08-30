import { createRouter, createWebHistory } from 'vue-router';
import Market from '../views/Market.vue';

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'market', component: Market },
    { path: '/stock/:symbol', name: 'stock', component: () => import('../views/StockDetail.vue') },
    { path: '/portfolio', name: 'portfolio', component: () => import('../views/Portfolio.vue') },
    { path: '/review', name: 'review', component: () => import('../views/Review.vue') },
  ],
});
