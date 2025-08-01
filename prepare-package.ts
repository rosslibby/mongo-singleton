import fs from 'fs';
import path from 'path';
const devPkg = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')
);

(function prepare() {
  const distPkg = cleanPkg(devPkg);
  const { name, version } = distPkg;

  console.log(`🎬 Preparing ${name} for publish to NPM`);
  console.log(`⚡️ Upgraded to version ${version}`);

  const distPkgPath = path.join(process.cwd(), 'dist', 'package.json');
  fs.writeFileSync(
    distPkgPath,
    Buffer.from(JSON.stringify(distPkg, null, 2)),
    'utf-8',
  );
  console.log(`✅ Finished preparing ${name}`);
})();

function cleanPkg(config: any): any {
  const { name, version, main, module, types, exports, ...rest } = config;

  return {
    name,
    version,
    main: main.replace(/dist\//, ''),
    module: module.replace(/dist\//, ''),
    types: types.replace(/dist\//, ''),
    ...rest,
    exports: {
      ...exports,
      '.': {
        ...exports['.'],
        import: exports['.'].import.replace(/dist\//, ''),
        require: exports['.'].require.replace(/dist\//, ''),
      },
    },
  };
}
