
const through = require('./through');
const fs = require('fs-extra');
const path = require('path');
const revHash = require('rev-hash');
const log = require('fancy-log');
const Promise = require('bluebird');

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
    cache: 'bs-cache',
    dest: 'docs',
    base: process.cwd(),
    log: true,
    ...options,
  };

  const manifestPath = path.resolve(options.base, options.manifest);
  var manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath));
  } catch (e) {
    manifest = {};
  }

  const destinationPath = path.resolve(options.base, options.dest);

  const cacheQueue = [];

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

    if (!file.buildSaver.destPath) {
      // this file has never received a destination
      if (options.log) log('[build]', sourcePath, destkey);
      stream.push(file);
      return;
    }

    // const cachePath = path.resolve(options.cache, relPath(destinationPath, file.buildSaver.destPath));
    const cachePath = relPath(destinationPath, path.resolve(options.base, file.buildSaver.destPath));
    const cacheTarget = path.resolve(options.base, options.cache, cachePath);

    file.buildSaver.cachePath = cachePath;
    file.buildSaver.cacheTarget = cacheTarget;

    if (await fs.pathExists(file.buildSaver.destPath)) {
      // The file is unchanged and already exists, skip it.
      if (options.log) log('[skipped]', sourcePath, destkey);
      return;
    }

    if (await fs.pathExists(cacheTarget)) {
      cacheQueue.push(file);
      // The file will be read from cache.
      if (options.log) log('[cached]', sourcePath, destkey);
      return;
    }

    // the file does not exist and is not in cache, build it
    if (options.log) log('[build]', sourcePath, destkey);
    stream.push(file);
  });

  const cache = () => through(
    async (stream, file) => stream.push(file),
    (stream) => Promise.each(cacheQueue, async (file) => {
      file.contents = await fs.readFile(file.buildSaver.cacheTarget);
      file.path = file.buildSaver.cachePath;
      file.buildSaver = null;
      stream.push(file);
    })
  );

  const finish = () => through(
    async (stream, file) => {

      if (!file.buildSaver) {
        // this was not build saved
        stream.push(file);
        return;
      }

      const destPath = relPath(file.buildSaver.cwd, file.path);
      const cachePath = path.resolve(options.cache, relPath(destinationPath, file.path));
      log('written to', cachePath);

      file.buildSaver.destPath = destPath;
      await fs.ensureDir(path.dirname(cachePath));
      await fs.writeFile(cachePath, file.contents);

      stream.push(file);
    },
    async () => {
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, '  '));
    }
  );

  return { source, cache, finish };
};

