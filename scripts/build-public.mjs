import { mkdir, copyFile, cp } from 'node:fs/promises';
await mkdir('public', { recursive: true });
for (const file of ['index.html', 'style.css', 'app.js', 'site-completo.html']) {
  await copyFile(file, `public/${file}`);
}
for (const dir of ['css', 'images']) await cp(dir, `public/${dir}`, { recursive: true });
console.log('Página estática preparada em public/. API será executada como Vercel Function.');
