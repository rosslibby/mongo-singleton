import fs from 'fs';
import path from 'path';
const devPkg = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')
);

(function prepare() {
  const { devDependencies, scripts, ...rest } = devPkg;
  console.log(`🎬 Preparing ${rest.name} for publish to NPM`);
  console.log(`⚡️ Upgraded version ${rest.version}`);
  const distPkg = { ...rest };

  const distPkgPath = path.join(process.cwd(), 'dist', 'package.json');
  fs.writeFileSync(
    distPkgPath,
    Buffer.from(JSON.stringify(distPkg, null, 2)),
    'utf-8',
  );
  console.log(`✅ Finished preparing ${rest.name}`);
})();
