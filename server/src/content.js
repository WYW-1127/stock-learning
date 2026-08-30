// 内容读取 — 术语表 / 课程 markdown(只读,无状态)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.join(__dirname, '..', '..', 'content');

// 课程 id 仅允许小写字母数字与连字符,防目录穿越
const LESSON_ID_RE = /^[a-z0-9-]+$/;

export function getTerms() {
  const raw = fs.readFileSync(path.join(CONTENT_DIR, 'terms.json'), 'utf8');
  return JSON.parse(raw).terms;
}

// 课程列表:[{ id, title }],title 取 markdown 首行 "# xxx"
export function listLessons() {
  const dir = path.join(CONTENT_DIR, 'lessons');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const id = f.replace(/\.md$/, '');
      const firstLine = fs.readFileSync(path.join(dir, f), 'utf8').split('\n')[0] || '';
      return { id, title: firstLine.replace(/^#\s*/, '').trim() || id };
    });
}

// 单篇课程:{ id, title, markdown };不存在返回 null
export function getLesson(id) {
  if (!LESSON_ID_RE.test(id)) return null;
  const file = path.join(CONTENT_DIR, 'lessons', `${id}.md`);
  if (!fs.existsSync(file)) return null;
  const markdown = fs.readFileSync(file, 'utf8');
  const title = (markdown.split('\n')[0] || '').replace(/^#\s*/, '').trim() || id;
  return { id, title, markdown };
}
