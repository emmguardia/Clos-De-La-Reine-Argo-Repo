import fs from 'fs';
import path from 'path';

const distDir = 'dist';
const srcDir = 'src';

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(childItemName => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

copyRecursiveSync(srcDir, path.join(distDir, srcDir));
fs.copyFileSync('package.json', path.join(distDir, 'package.json'));
if (fs.existsSync('package-lock.json')) {
  fs.copyFileSync('package-lock.json', path.join(distDir, 'package-lock.json'));
}

console.log('✅ Build terminé : dist/ créé');

