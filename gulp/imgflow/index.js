const path = require('path');
const glob = require('../lib/glob');
const { groupBy, sortBy } = require('lodash');
const Promise = require('bluebird');
const fs = require('fs-extra');
const log = require('fancy-log');
const actions = require('./actions');

const CWD = path.resolve(__dirname, '../..');
const SOURCE = path.resolve(CWD, 'posts/*/*.{jpeg,jpg,png,gif,m4v}');
const POST_GROUPING = /posts\/([^/]+)/;
const MANIFEST_PATH = path.resolve(CWD, 'if-manifest.json');
const REV_MANIFEST_PATH = path.resolve(CWD, 'rev-manifest.json');
const CACHE = 'if-cache';
const revHash = require('rev-hash');
const revPath = require('rev-path');


const LOG = {
  new:    true,
  update: true,
  skip:   true,
  rebuild:  true,
  cached: false,
  copy: false,
};

module.exports = exports = async function imageFlow ({ rev = false }) {

  var manifest;
  try {
    manifest = JSON.parse(await fs.readFile(MANIFEST_PATH));
  } catch (e) {
    manifest = {};
  }

  const allfiles = (await glob(SOURCE)).map((f) => path.relative(CWD, f));
  const filesByPost = groupBy(allfiles, (fpath) => fpath.match(POST_GROUPING)[1]);

  const statMap = new Map();
  async function stat (f) {
    if (statMap.has(f)) return statMap.get(f);

    const p = fs.stat(path.resolve(CWD, f))
      .catch(() => null)
      .then((stats) => (stats && stats.mtimeMs));

    statMap.set(f, p);
    return p;
  }

  const tasks = [];

  for (const [ postKey, files ] of Object.entries(filesByPost)) {
    const hash = postKey.split('.')[2];

    const images = [];
    let poster = null;
    let titlecard = null;
    const other = files.filter((f) => {
      let unused = true;

      // match against image posts
      if (f.match(/\/\d?\d?\d(?:-\d?\d)?.(?:jpe?g|png|gif)$/)) {
        unused = false;
        images.push(f);
      }

      // match against posters
      if (f.match(/\/poster.(?:jpe?g|png|gif)$/)) {
        unused = false;
        poster = f;
      }

      // match against posters
      if (f.match(/\/titlecard.(?:jpe?g|png|gif)$/)) {
        unused = false;
        titlecard = f;
      }

      return unused;
    });

    images.sort();

    poster = poster || images[0];

    if (titlecard) {
      tasks.push({
        input: titlecard,
        output: `docs/p/${hash}/titlecard.jpeg`,
        action: actions.transcode,
      });
    }

    if (poster) {
      tasks.push({
        input: poster,
        output: `docs/p/${hash}/poster.jpeg`,
        action: actions.max,
      });
      tasks.push({
        input: poster,
        output: `docs/p/${hash}/poster.lg.jpeg`,
        action: actions.lg,
      });
      tasks.push({
        input: poster,
        output: `docs/p/${hash}/poster.md.jpeg`,
        action: actions.md,
      });
      tasks.push({
        input: poster,
        output: `docs/p/${hash}/poster.sm.jpeg`,
        action: actions.sm,
      });
      tasks.push({
        input: poster,
        output: `docs/p/${hash}/poster.xs.jpeg`,
        action: actions.xs,
      });
      tasks.push({
        input: poster,
        output: `docs/p/${hash}/poster.thumb.jpeg`,
        action: actions.thumb,
      });

      tasks.push({
        input: poster,
        output: `docs/p/${hash}/titlecard-north.jpeg`,
        action: actions.tcNorth,
      });
      tasks.push({
        input: poster,
        output: `docs/p/${hash}/titlecard-south.jpeg`,
        action: actions.tcSouth,
      });
      tasks.push({
        input: poster,
        output: `docs/p/${hash}/titlecard-center.jpeg`,
        action: actions.tcCenter,
      });
      tasks.push({
        input: poster,
        output: `docs/p/${hash}/titlecard-square.jpeg`,
        action: actions.tcSquare,
      });

    } else {
      log.warn('Post is missing a poster image', postKey);
    }

    images.forEach((f) => {
      const ext = path.extname(f);
      const fname = path.basename(f, ext);
      tasks.push({
        input: f,
        output: `docs/p/${hash}/${fname}.jpeg`,
        action: actions.max,
      });
      tasks.push({
        input: f,
        output: `docs/p/${hash}/${fname}.lg.jpeg`,
        action: actions.lg,
      });
      tasks.push({
        input: f,
        output: `docs/p/${hash}/${fname}.sm.jpeg`,
        action: actions.sm,
      });
      tasks.push({
        input: f,
        output: `docs/p/${hash}/${fname}.pre1x.jpeg`,
        action: actions.carousel1x,
      });
      tasks.push({
        input: f,
        output: `docs/p/${hash}/${fname}.pre2x.jpeg`,
        action: actions.carousel2x,
      });
      tasks.push({
        input: f,
        output: `docs/p/${hash}/${fname}.thumb.jpeg`,
        action: actions.thumb,
      });
    });

    other.forEach((f) => {
      const fname = path.basename(f);
      tasks.push({
        input: f,
        output: `docs/p/${hash}/${fname}`,
        action: actions.copy,
      });
    });

  }

  const pending = await Promise.filter(tasks, async (task) => {
    const hash = revHash(JSON.stringify(task));
    const prev = manifest[hash];
    const cachePath = path.join(CACHE, `${task.action.name}.${hash}${path.extname(task.output)}`);
    const [ inTime, outTime, cachedTime ] = await Promise.all([
      stat(path.resolve(CWD, task.input)),
      stat(path.resolve(CWD, task.output)),
      stat(path.resolve(CWD, cachePath)),
    ]);

    task.hash = hash;
    task.cache = cachePath;

    // how did this happen?
    if (!inTime) {
      log.error('Input file could not be found?', task.input);
      return false;
    }

    // never seen this file before
    if (!prev) {
      manifest[hash] = {
        hash,
        input: task.input,
        output: task.output,
        mtime: inTime,
      };
      task.log = [ 'new', task.input, task.output ];
      return true;
    }

    // file modification time does not match last read, rebuild
    if (inTime !== prev.mtime) {
      prev.mtime = inTime;
      task.log = [ 'update', task.input, task.output ];
      return true;
    }

    // target file exists, nothing to do
    if (outTime) {
      return false;
    }

    // file exists in the cache, change the task to a copy action
    if (cachedTime) {
      task.log = [ 'cached', task.input, task.output ];
      task.action = actions.copy;
      task.input = cachePath;
      return true;
    }

    // task is a file copy
    if (task.action === actions.copy) {
      task.log = [ 'copy', task.input, task.output ];
      return true;
    }

    // file does not exist in cache, build it
    task.log = [ 'rebuild', task.input, task.output ];
    return true;
  });

  const revManifest = {};

  await Promise.map(sortBy(pending, [ 'input', 'output' ]), async (task) => {
    const result = await task.action(task);
    if (task.log && LOG[task.log[0]]) log.info(...task.log);
    manifest[task.hash].lastSeen = Date.now();

    if (rev) {
      const rhash = revHash(result);
      const hashedPath = revPath(task.output, rhash);
      manifest[task.hash].revHash = rhash;
      manifest[task.hash].revPath = hashedPath;

      const rOutPath = path.relative(path.join(CWD, '/docs/'), task.output);
      const rNewPath = path.relative(path.join(CWD, '/docs/'), hashedPath);

      revManifest[rOutPath] = rNewPath;

      await fs.copy(task.output, hashedPath);
    }
  }, { concurrency: 10 });

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  if (rev) {
    let originalManifest = {};
    try {
      if (await fs.exists(REV_MANIFEST_PATH)) {
        originalManifest = JSON.parse(await fs.readFile(REV_MANIFEST_PATH));
      }
    } catch (e) {
      // do nothing
    }

    Object.assign(originalManifest, revManifest);

    await fs.writeFile(REV_MANIFEST_PATH, JSON.stringify(originalManifest, null, 2));
  }

};



if (require.main === module) {
  exports().catch(console.error).then(() => process.exit()); // eslint-disable-line
}

