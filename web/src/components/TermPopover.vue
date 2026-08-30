<script setup>
// 术语卡 — 虚线下划线触发,点击弹出通俗解释浮层
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useContentStore } from '../stores/content.js';

const props = defineProps({ word: { type: String, required: true } });
const store = useContentStore();
const open = ref(false);
const root = ref(null);
const term = ref(null);

async function toggle() {
  open.value = !open.value;
  if (open.value) {
    await store.ensureTerms();
    term.value = store.findTerm(props.word);
  }
}
function onDocClick(e) {
  if (open.value && root.value && !root.value.contains(e.target)) open.value = false;
}
onMounted(() => {
  document.addEventListener('click', onDocClick);
  store.ensureTerms();
});
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));
</script>

<template>
  <span ref="root" class="term-wrap">
    <span class="term-trigger" @click.stop="toggle">{{ word }}</span>
    <Transition name="pop">
      <div v-if="open" class="term-pop" role="tooltip">
        <div class="term-pop-title">{{ word }}</div>
        <div class="term-pop-body">
          <template v-if="term">{{ term.explain }}</template>
          <template v-else>暂无解释,可以先看看新手课程里的说明。</template>
        </div>
      </div>
    </Transition>
  </span>
</template>

<style scoped>
.term-wrap { position: relative; }
.term-pop {
  position: absolute;
  left: 0;
  top: calc(100% + 6px);
  z-index: 60;
  width: 320px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(24, 24, 27, 0.1);
  padding: 12px 14px;
  text-align: left;
}
.term-pop-title { font-weight: 700; font-size: 13px; margin-bottom: 4px; }
.term-pop-body { font-size: 13px; color: var(--muted); line-height: 1.7; }
.pop-enter-active, .pop-leave-active { transition: opacity 0.12s, transform 0.12s; }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
