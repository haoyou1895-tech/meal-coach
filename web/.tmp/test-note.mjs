import fs from 'fs';
const f = '../测试食物图片/正餐/1e9ea76f1928b125f66774f87913e65f.jpg';
const b64 = fs.readFileSync(f).toString('base64');
const note = process.argv[2] || '还喝了一碗紫菜蛋花汤';
const t0 = Date.now();
const r = await fetch('http://127.0.0.1:3000/api/recognize', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ image: 'data:image/jpeg;base64,' + b64, note }),
});
const j = await r.json();
console.log('HTTP', r.status, `${Date.now()-t0}ms`, 'note=', note);
console.log(JSON.stringify({ items: j.items, noteCheck: j.noteCheck }, null, 1));
