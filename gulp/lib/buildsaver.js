
const through = require('./through');
const fs = require('fs-extra');
const path = require('path');
const revHash = require('rev-hash');
const log = require('fancy-log');


function relPath (base, filePath) {
  filePath = filePath.replace(/\\/g, '/');
  base = base.replace(/\\/g, '/');

  if (!filePath.startsWith(base)) {
    return filePath;
  }

  const newPath = filePath.slice(base.length);

  if (newPath[0] === '/') {
    return newPath.slice(1);
  }

  return newPath;
}

module.exports = exports = function (options) {
  options = {
    manifest: 'bs-manifest.json',
    base: process.cwd(),
    log: false,
    ...options,
  };

  const manifestPath = path.resolve(options.base, options.manifest);
  var manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath));
  } catch (e) {
    manifest = {};
  }

  const source = (destkey) => through(async (stream, file) => {
    if (!file) return;

    if (file.buildSaver) {
      // this has been handled somehow already?
      stream.push(file);
      return;
    }

    if (destkey === undefined) destkey = '';
    const sourcePath = relPath(file.cwd, file.path);
    const key = destkey ? sourcePath + ':' + destkey : sourcePath;
    const rev = revHash(file.contents);

    if (!manifest[key]) {
      // have not seen this file before
      file.buildSaver = manifest[key] = {
        key,
        sourcePath,
        rev,
        cwd: file.cwd,
      };
      if (options.log) log('[new]', sourcePath, destkey);
      stream.push(file);
      return;
    }

    file.buildSaver = manifest[key];

    if (file.buildSaver.rev !== rev) {
      // file has changed, log hash and let file process
      file.buildSaver.rev = rev;
      if (options.log) log('[update]', sourcePath, destkey);
      stream.push(file);
      return;
    }

    if (!file.buildSaver.destPath || !(await fs.pathExists(file.buildSaver.destPath))) {
      // this file has never received a destination or doesn't exist
      if (options.log) log('[build]', sourcePath, destkey);
      stream.push(file);
      return;
    }

    // The file is unchanged and already exists, skip it.
    if (options.log) log('[skipped]', sourcePath, destkey);
  });

  const finish = () => through(
    async (stream, file) => {

      if (!file.buildSaver) {
        // this was not build saved
        stream.push(file);
        return;
      }

      const destPath = relPath(file.buildSaver.cwd, file.path);

      file.buildSaver.destPath = destPath;

      stream.push(file);
    },
    async () => {
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, '  '));
    }
  );

  return { source, finish };
};

