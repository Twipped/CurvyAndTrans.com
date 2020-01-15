const path = require('path');
const glob = require('../lib/glob');
const { groupBy, sortBy, omitBy, uniqBy } = require('lodash');
const Promise = require('bluebird');
const fs = require('fs-extra');
const log = require('fancy-log');
const actions = require('./actions');

const CWD = path.resolve(__dirname, '../..');
const SOURCE = path.resolve(CWD, '{posts,lists}/*/*.{jpeg,jpg,png,gif,m4v}');
const POST_GROUPING = /(?:posts|lists)\/([^/]+)/;
const MANIFEST_PATH = path.resolve(CWD, 'if-manifest.json');
const REV_MANIFEST_PATH = path.resolve(CWD, 'rev-manifest.json');
const POSTS_INDEX_PATH = path.resolve(CWD, 'posts.json');
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

module.exports = exports = async function postImages ({ rev = false }) {

  var manifest;
  try {
    manifest = JSON.parse(await fs.readFile(MANIFEST_PATH));
  } catch (e) {
    manifest = {};
  }

  await fs.ensureDir(path.resolve(CWD, CACHE));

  const allfiles = (await glob(SOURCE)).map((f) => path.relative(CWD, f));
  const filesByPost = groupBy(allfiles, (fpath) => fpath.match(POST_GROUPING)[1]);
  const tasks = [];

  for (const [ postKey, files ] of Object.entries(filesByPost)) {
    let hash, targetType;
    if (files[0].substr(0, 5) === 'lists') {
      targetType = 'l';
      hash = postKey;
    } else {
      targetType = 'p';
      hash = postKey.split('.')[2];
    }

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
        output: `${targetType}/${hash}/titlecard.jpeg`,
        action: actions.transcode,
      });
    }

    if (poster) {
      tasks.push({
        input: poster,
        output: `${targetType}/${hash}/poster.jpeg`,
        action: actions.max,
      });
      tasks.push({
        input: poster,
        output: `${targetType}/${hash}/poster.lg.jpeg`,
        action: actions.lg,
      });
      tasks.push({
        input: poster,
        output: `${targetType}/${hash}/poster.md.jpeg`,
        action: actions.md,
      });
      tasks.push({
        input: poster,
        output: `${targetType}/${hash}/poster.sm.jpeg`,
        action: actions.sm,
      });
      tasks.push({
        input: poster,
        output: `${targetType}/${hash}/poster.xs.jpeg`,
        action: actions.xs,
      });
      tasks.push({
        input: poster,
        output: `${targetType}/${hash}/poster.thumb.jpeg`,
        action: actions.thumb,
      });

      tasks.push({
        input: poster,
        output: `${targetType}/${hash}/titlecard-north.jpeg`,
        action: actions.tcNorth,
      });
      tasks.push({
        input: poster,
        output: `${targetType}/${hash}/titlecard-south.jpeg`,
        action: actions.tcSouth,
      });
      tasks.push({
        input: poster,
        output: `${targetType}/${hash}/titlecard-center.jpeg`,
        action: actions.tcCenter,
      });
      tasks.push({
        input: poster,
        output: `${targetType}/${hash}/titlecard-square.jpeg`,
        action: actions.tcSquare,
      });
      tasks.push({
        input: poster,
        output: `${targetType}/${hash}/titlecard-box.jpeg`,
        action: actions.tcBox,
      });

    } else {
      log.warn('Post is missing a poster image', postKey);
    }

    images.forEach((f) => {
      const ext = path.extname(f);
      const fname = path.basename(f, ext);
      tasks.push({
        input: f,
        output: `${targetType}/${hash}/${fname}.jpeg`,
        action: actions.max,
      });
      tasks.push({
        input: f,
        output: `${targetType}/${hash}/${fname}.lg.jpeg`,
        action: actions.lg,
      });
      tasks.push({
        input: f,
        output: `${targetType}/${hash}/${fname}.sm.jpeg`,
        action: actions.sm,
      });
      tasks.push({
        input: f,
        output: `${targetType}/${hash}/${fname}.pre1x.jpeg`,
        action: actions.carousel1x,
      });
      tasks.push({
        input: f,
        output: `${targetType}/${hash}/${fname}.pre2x.jpeg`,
        action: actions.carousel2x,
      });
      tasks.push({
        input: f,
        output: `${targetType}/${hash}/${fname}.thumb.jpeg`,
        action: actions.thumb,
      });
    });

    other.forEach((f) => {
      const fname = path.basename(f);
      tasks.push({
        input: f,
        output: `${targetType}/${hash}/${fname}`,
        action: actions.copy,
      });
    });

  }

  const filtered = await filter(manifest, tasks);
  await execute(manifest, filtered, rev);
};

exports.prod = function imagesProd () { return exports({ rev: true }); };

exports.twitter = async function twitterImages ({ rev = false }) {
  await fs.ensureDir(path.resolve(CWD, CACHE));

  var manifest;
  try {
    manifest = JSON.parse(await fs.readFile(MANIFEST_PATH));
  } catch (e) {
    manifest = {};
  }

  var posts;
  try {
    posts = JSON.parse(await fs.readFile(POSTS_INDEX_PATH));
  } catch (e) {
    posts = {};
  }

  let media = [];
  for (const p of posts) {
    if (!p.tweets) continue;
    for (const tweet of Object.values(p.tweets)) {
      media.push(...tweet.media);
    }
  }

  media = uniqBy(media, 'output');
  const tasks = media.map((m) => ({ ...m, action: actions.fetch }));
  const filtered = await filter(manifest, tasks);
  await execute(manifest, filtered, rev);
};

exports.twitter.prod = function imagesProd () { return exports.twitter({ rev: true }); };


async function filter (manifest, tasks) {
  const statMap = new Map();
  async function stat (f) {
    if (statMap.has(f)) return statMap.get(f);

    const p = fs.stat(path.resolve(CWD, f))
      .catch(() => null)
      .then((stats) => (stats && Math.floor(stats.mtimeMs / 1000)));

    statMap.set(f, p);
    return p;
  }

  return Promise.filter(tasks, async (task) => {

    const local = task.input.slice(0, 4) !== 'http';
    const hash = task.action.name + '.' + revHash(task.input) + '|' + revHash(task.output);
    const cachePath = path.join(CACHE, `${hash}${path.extname(task.output)}`);
    const [ inTime, outTime, cachedTime ] = await Promise.all([
      local && stat(path.resolve(CWD, task.input)),
      stat(path.resolve(CWD, 'docs', task.output)),
      stat(path.resolve(CWD, cachePath)),
    ]);

    task.manifest = manifest[hash];
    task.hash = hash;
    task.cache = cachePath;

    // how did this happen?
    if (local && !inTime) {
      log.error('Input file could not be found?', task.input);
      return false;
    }

    // never seen this file before
    if (!task.manifest) {
      task.apply = {
        hash,
        input: task.input,
        output: task.output,
        mtime: inTime,
      };
      task.log = [ 'new', task.input, task.output, hash ];
      return true;
    }

    // file modification time does not match last read, rebuild
    if (local && inTime > task.manifest.mtime) {
      task.log = [ 'update', task.input, task.output ];
      task.apply = {
        mtime: inTime,
      };
      return true;
    }

    task.apply = {
      mtime: local ? inTime : Math.floor(Date.now() / 1000),
    };

    // target file exists, nothing to do
    if (outTime) {
      return false;
      // task.log = [ 'skip', task.input, task.output, inTime, task.manifest.mtime ];
      // task.action = null;
      // return true;
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
}


async function execute (manifest, tasks, rev) {
  const lastSeen = Math.floor(Date.now() / 1000);
  const revManifest = {};

  let writeCounter = 0;
  async function writeManifest (force) {
    if (!force && ++writeCounter % 10) return;
    await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  }

  await Promise.map(sortBy(tasks, [ 'input', 'output' ]), async (task) => {
    const output = path.resolve(CWD, 'docs', task.output);

    const result = task.action && await task.action({ ...task, output });
    const apply = task.apply || {};
    if (task.log && LOG[task.log[0]]) log.info(...task.log);
    apply.lastSeen = lastSeen;
    apply.lastSeenHuman = new Date();

    const rhash = result && revHash(result);
    const hashedPath = revPath(task.output, rhash);
    apply.revHash = rhash;
    apply.revPath = hashedPath;

    if (rev && rhash) {
      const rOutPath = path.relative(path.resolve(CWD, 'docs'), task.output);
      const rNewPath = path.relative(path.resolve(CWD, 'docs'), hashedPath);

      revManifest[rOutPath] = rNewPath;

      await fs.copy(output, path.resolve(CWD, 'docs', hashedPath));
    }

    manifest[task.hash] = { ...manifest[task.hash], ...apply };
    await writeManifest();

  }, { concurrency: 10 });

  // filter unseen files from history
  // manifest = omitBy(manifest, (m) => m.lastSeen !== lastSeen);

  writeManifest(true);

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

}

if (require.main === module) {
  exports().catch(console.error).then(() => process.exit()); // eslint-disable-line
}

