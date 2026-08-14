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

// Le Dockerfile installe les dépendances de production depuis dist/, il lui
// faut donc les trois fichiers dont pnpm a besoin :
//   - package.json    : les dépendances et le bloc pnpm (overrides, onlyBuiltDependencies)
//   - pnpm-lock.yaml  : l'install en --frozen-lockfile échoue sans lui
//   - .npmrc          : porte ignore-scripts=true, qui doit aussi s'appliquer
//                       pendant le build de l'image
const manifests = ['package.json', 'pnpm-lock.yaml', '.npmrc'];
for (const file of manifests) {
  if (!fs.existsSync(file)) {
    console.error(`❌ Fichier manquant : ${file}`);
    process.exit(1);
  }
  fs.copyFileSync(file, path.join(distDir, file));
}

console.log('✅ Build terminé : dist/ créé');

