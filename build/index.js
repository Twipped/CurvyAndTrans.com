
process.env.BLUEBIRD_DEBUG = true;

const loadPublicFiles = require('./public');
const loadPostFiles = require('./posts');
const loadListFiles = require('./lists');
const Cache = require('./cache');
const Promise = require('bluebird');
const fs = require('fs-extra');
const { sortBy } = require('lodash');
const RSS  = require('rss');
const { siteInfo } = require('../package.json');

const getEngines = require('./engines');
const primeTweets = require('./page-tweets');
const pageWriter = require('./page-writer');
const evaluate = require('./evaluate');
const { resolve } = require('./resolve');

const favicon = require('./favicon');
const scss    = require('./scss');
const svg     = require('./svg');
const scripts = require('./scripts');

function writeIndex (destination, files, compressed) {
  files = files.map((p) => !p.draft && (p.toJson ? p.toJson() : p));
  return fs.writeFile(resolve(destination), compressed ? JSON.stringify(files) : JSON.stringify(files, null, 2));
}

exports.everything = function (prod = false) {
  async function fn () {

    // load a directory scan of the public and post folders
    const [ PublicFiles, PostFiles, ListFiles ] = await Promise.all([
      loadPublicFiles(),
      loadPostFiles(),
      loadListFiles(),
    ]);

    // load data for all the files in that folder
    await Promise.map(PublicFiles.assets, (p) => p.load());
    await Promise.map(PublicFiles.pages, (p) => p.load(PublicFiles));

    await Promise.map(PostFiles.assets, (p) => p.load());
    await Promise.map(PostFiles.pages, (p) => p.load(PostFiles));

    await Promise.map(ListFiles.assets, (p) => p.load());
    await Promise.map(ListFiles.pages, (p) => p.load(ListFiles));


    // prime tweet data for all pages
    let pages = await primeTweets(PublicFiles.pages.filter((p) => !p.meta.ignore));
    pages = pages.filter(Boolean);

    let posts = await primeTweets(PostFiles.pages.filter((p) => !p.meta.ignore));
    posts = posts.filter(Boolean);
    posts = sortBy(posts, 'date');
    posts.reverse();

    let lists = ListFiles.pages.filter((p) => !p.meta.ignore);
    lists = sortBy(lists, 'date');
    lists.reverse();

    const assets = [ ...PostFiles.assets, ...PublicFiles.assets ];

    const [ tasks ] = await Promise.all([
      await Promise.all([
        PublicFiles.tasks,
        PostFiles.tasks,
        scss(prod),
        scripts(prod),
        svg(prod),
        favicon(prod),
      ]),
      fs.ensureDir(resolve('dist')),
      writeIndex('pages.json',  pages),
      writeIndex('posts.json', posts),
      writeIndex('assets.json', assets),
    ]);

    const cache = new Cache({ prod });
    await cache.load();
    await evaluate(tasks.flat(), cache);
    const { revManifest } = await cache.save();

    const engines = await getEngines(prod);
    const postIndex = await pageWriter(prod, engines, pages, posts, lists);
    postIndex.rev = revManifest;
    await fs.writeFile(resolve('dist/p/index.json'), prod ? JSON.stringify(postIndex) : JSON.stringify(postIndex, null, 2));

    const feed = new RSS(siteInfo.rss);
    postIndex.posts.forEach((post) => {
      if (post.subPage) return;
      const description = post.poster ? `<img src="${siteInfo.rss.site_url + post.poster[0].url}"><br>${post.preview}` : post.preview;
      feed.item({
        title: post.title,
        date: post.date,
        description,
        url: post.fullurl,
        categories: Object.values(post.tags),
        guid: post.id,
        enclosure: post.poster && {
          url: siteInfo.rss.site_url + post.poster[0].url,
        },
      });
    });
    await fs.writeFile(resolve('dist/atom.xml'), feed.xml());
  }

  fn.displayName = prod ? 'buildForProd' : 'build';
  return fn;
};

exports.pages = function () {
  async function fn () {
    const prod = false;
    // load a directory scan of the public and post folders
    const [ PublicFiles, PostFiles, ListFiles ] = await Promise.all([
      loadPublicFiles(),
      loadPostFiles(),
      loadListFiles(),
    ]);

    // load data for all the files in that folder
    await Promise.map(PublicFiles.assets, (p) => p.load());
    await Promise.map(PublicFiles.pages, (p) => p.load(PublicFiles));

    await Promise.map(PostFiles.assets, (p) => p.load());
    await Promise.map(PostFiles.pages, (p) => p.load(PostFiles));

    await Promise.map(ListFiles.assets, (p) => p.load());
    await Promise.map(ListFiles.pages, (p) => p.load(ListFiles));

    // prime tweet data for all pages
    const pages = await primeTweets(PublicFiles.pages.filter((p) => !p.meta.ignore));

    let posts = await primeTweets(PostFiles.pages.filter((p) => !p.meta.ignore));
    posts = sortBy(posts, 'date');
    posts.reverse();

    let lists = ListFiles.pages.filter((p) => !p.meta.ignore);
    lists = sortBy(lists, 'date');
    lists.reverse();

    const engines = await getEngines(prod);
    const postIndex = await pageWriter(prod, engines, pages, posts, lists);
    postIndex.rev = {};
    await fs.writeFile(resolve('dist/p/index.json'), prod ? JSON.stringify(postIndex) : JSON.stringify(postIndex, null, 2));
  }

  fn.displayName = 'buildPages';
  return fn;
};

exports.task = function (action, prod = false) {
  const fn = async () => {
    const tasks = await {
      scss,
      favicon,
      svg,
      scripts,
    }[action](prod);

    if (!tasks.length) return;

    await fs.ensureDir(resolve('dist'));
    const cache = new Cache({ prod });
    await cache.load();
    await evaluate(tasks, cache);
    await evaluate(tasks.flat(), cache);
    await cache.save();
  };

  fn.displayName = prod ? action + 'ForProd' : action;
  return fn;
};
