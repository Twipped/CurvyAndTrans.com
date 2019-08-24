
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
    skip: true,
    rev: false,
    manifest: 'bs-manifest.json',
    cache: 'bs-cache',
    dest: 'docs',
    base: process.cwd(),
    log: false,
    ...options,
  };

  if (options.log === true) {
    options.log = {
      'new':    true,
      'update': true,
      'skip':   true,
      'build':  true,
      'cached': true,
    };
  } else if (!options.log) {
    options.log = {
      'new':    false,
      'update': false,
      'skip':   false,
      'build':  false,
      'cached': false,
    };
  }

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

    if (destkey === undefined) destkey = '';
    const sourcePath = relPath(file.cwd, file.path);
    const key = destkey ? sourcePath + ':' + destkey : sourcePath;
    const mtime = file.stat.mtime.toJSON();

    if (file.buildSaver) {
      // this has been handled somehow already?
      if (options.log.skip) log('[skip]', sourcePath, destkey);
      stream.push(file);
      return;
    }

    if (!manifest[key]) {
      // have not seen this file before
      file.buildSaver = manifest[key] = {
        key,
        sourcePath,
        rev: revHash(file.contents),
        mtime,
        cwd: file.cwd,
        log: [ '[new]', sourcePath, destkey ],
      };
      stream.push(file);
      return;
    }

    file.buildSaver = manifest[key];

    if (file.buildSaver.mtime !== mtime) {
      // file modification date changed, log new time and let file process
      file.buildSaver.mtime = mtime;
      file.buildSaver.log = [ 'update', sourcePath, destkey ];
      stream.push(file);
      return;
    }

    if (options.rev) {
      const rev = revHash(file.contents);
      if (file.buildSaver.rev !== rev) {
        // file has changed, log hash and let file process
        file.buildSaver.rev = rev;
        file.buildSaver.log = [ 'update', sourcePath, destkey ];
        stream.push(file);
        return;
      }
    }

    if (!file.buildSaver.destPath) {
      // this file has never received a destination
      file.buildSaver.log = [ 'build', sourcePath, destkey ];
      stream.push(file);
      return;
    }

    // const cachePath = path.resolve(options.cache, relPath(destinationPath, file.buildSaver.destPath));
    const cachePath = relPath(destinationPath, path.resolve(options.base, file.buildSaver.destPath));
    const cacheTarget = path.resolve(options.base, options.cache, cachePath);

    file.buildSaver.cachePath = cachePath;
    file.buildSaver.cacheTarget = cacheTarget;

    if (options.skip && await fs.pathExists(file.buildSaver.destPath)) {
      file.buildSaver.log = [ 'skip', sourcePath, destkey ];
      // The file is unchanged and already exists, skip it.
      return;
    }

    if (await fs.pathExists(cacheTarget)) {
      file.buildSaver.log = [ 'cached', sourcePath, destkey ];
      cacheQueue.push(file);
      // The file will be read from cache.
      return;
    }

    // the file does not exist and is not in cache, build it
    file.buildSaver.log = [ '[build]', sourcePath, destkey ];
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

      if (file.buildSaver.log ) {
        log(...file.buildSaver.log);
        file.buildSaver.log = undefined;
      }

      const destPath = relPath(file.buildSaver.cwd, file.path);
      const cachePath = path.resolve(options.cache, relPath(destinationPath, file.path));
      // log('written to', cachePath);

      file.buildSaver.destPath = destPath;
      stream.push(file);

      await fs.ensureDir(path.dirname(cachePath));
      await fs.writeFile(cachePath, file.contents);
    },
    async () => {
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, '  '));
    }
  );

  return { source, cache, finish };
};

