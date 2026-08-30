import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8090;

const app = express();
app.use(express.json());

// ---- API 路由(T5 任务逐步挂载) ----
app.get('/api/meta/status', (req, res) => {
  res.json({ ok: true, mode: 'live', time: new Date().toISOString() });
});

// ---- 前端静态资源 ----
const dist = path.join(__dirname, '../../web/dist');
app.use(express.static(dist));
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(dist, 'index.html'));
  }
  next();
});

app.listen(PORT, () => {
  // 控制台可能是 GBK 代码页,启动提示用 ASCII 避免乱码
  console.log(`Server ready: http://localhost:${PORT}`);
});
