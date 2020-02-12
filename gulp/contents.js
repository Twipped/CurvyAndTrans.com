
const path = require('path');
const fs = require('fs-extra');
const D = require('date-fns');
const { chunk, uniq, findIndex, sortBy, groupBy, keyBy, reduce, omit, difference } = require('lodash');
const log = require('fancy-log');
const glob = require('./lib/glob');
const getDimensions = require('./lib/dimensions');
const memoize = require('memoizepromise');

const slugs = require('slugify');
const slugify = (s) => slugs(s, { remove: /[*+~.,()'"!?:@/\\]/g }).toLowerCase();


const { src, dest } = require('gulp');
const frontmatter = require('gulp-front-matter');
const collect     = require('gulp-collect');

const asyncthrough = require('./lib/through');

const INITIAL_LOAD = 20;
const ROOT = path.dirname(__dirname);
const DEST = './docs';

const { siteInfo } = require('../package.json');

const markdown = require('markdown-it');
const striptags = require('string-strip-html');
const tweetparse = require('./lib/tweetparse');

const handlebars = require('handlebars');
const HandlebarsKit = require('hbs-kit');
HandlebarsKit.load(handlebars);

const md     = markdown({
  html: true,
  linkify: true,
  typographer: true,
}).enable('image')
  .use(require('markdown-it-div'))
  .use(require('markdown-it-anchor'), {
    permalink: true,
    permalinkClass: 'header-link fas fa-link',
    permalinkSymbol: '',
    slugify,
  })
  .use(require('markdown-it-include'), path.join(ROOT, '/includes'))
  .use(require('./lib/markdown-raw-html'))
;

const mdPreview = markdown({
  html: false,
  linkify: false,
  typographer: true,
})
  .use(require('markdown-it-div'))
  .use(require('./lib/markdown-token-filter'))
  .use(require('./lib/markdown-raw-html'))
;

const Twitter = require('twitter-lite');
const twitter = new Twitter(require('../twitter.json'));

async function reloadLayouts () {
  const layouts = {
    layout:    'templates/layout.hbs.html',
    indexCard: 'templates/index-card.hbs.html',
    indexGrid: 'templates/index-grid.hbs.html',
    img:       'templates/post-image.hbs.html',
    tweets:    'templates/post-tweets.hbs.html',
  };

  let pending = Object.entries(layouts)
    .map(async ([ name, file ]) =>
      [ name, (await fs.readFile(path.resolve(ROOT, file))).toString('utf8') ],
    );

  pending = await Promise.all(pending);

  pending.forEach(([ name, file ]) => handlebars.registerPartial(name, handlebars.compile(file)));

  const injections = {};
  handlebars.registerHelper('inject', function (tpath, ...args) {
    const { hash } = args.pop();
    const context = handlebars.createFrame(args[0] || this);
    Object.assign(context, hash || {});

    if (tpath[0] === '/') tpath = path.join(context.local.root, tpath);
    if (tpath[0] === '~') tpath = path.join(context.local.cwd, tpath.slice(2));
    tpath += '.hbs';

    if (!injections[tpath]) {
      if (!fs.existsSync(tpath)) {
        log.error('Template does not exist for injection ' + path.relative(ROOT, tpath));
        return '';
      }

      try {
        injections[tpath] = handlebars.compile(fs.readFileSync(tpath).toString('utf8'));
      } catch (e) {
        log.error('Could not load injection template ' + path.relative(ROOT, tpath), e);
        return '';
      }
    }

    try {
      return new handlebars.SafeString(injections[tpath](context));
    } catch (e) {
      log.error('Could not execute injection template ' + path.relative(ROOT, tpath), e);
      return '';
    }
  });
}


exports.loadLayout = async function loadLayout () {
  await reloadLayouts();
  handlebars.registerPartial('postdebug', handlebars.compile(String(fs.readFileSync(path.join(ROOT, '/templates/postdebug.hbs.html')))));
  handlebars.registerHelper('rev', (url) => {
    if (!url) return '';
    if (url[0] === '/') url = url.substr(1);
    return '/' + url;
  });
  handlebars.registerHelper('prod', function (options) {
    if (!options.inverse) return false;
    return options.inverse(this);
  });
};

exports.loadLayout.prod = async function loadLayoutForProd () {
  const manifest = await fs.readJson(path.join(ROOT, 'rev-manifest.json')).catch(() => {}).then((r) => r || {});

  handlebars.registerPartial('postdebug', handlebars.compile(''));
  await reloadLayouts();

  handlebars.registerHelper('rev', (url) => {
    if (!url) return '';
    if (url[0] === '/') url = url.substr(1);

    if (manifest[url]) return '/' + manifest[url];
    return '/' + url;
  });
  handlebars.registerHelper('prod', function (options) {
    if (!options.fn) return true;
    return options.fn(this);
  });
};

function parseMeta () {
  const getFileData = memoize(async (id, cwd) => {
    const imageFiles = (await glob('*.{jpeg,jpg,png,gif,m4v}', { cwd }));

    const images = imageFiles.map((imgpath) => {
      if (!imgpath.match(/^\d?\d?\d(?:-\d?\d)?.(?:jpe?g|png|gif|m4v)$/)) {
        return null;
      }

      const ext = path.extname(imgpath);
      const basename = path.basename(imgpath, ext);
      if (ext === '.m4v') {
        return {
          type: 'movie',
          full: `/p/${id}/${basename}.m4v`,
        };
      }

      return {
        type: 'image',
        full: `/p/${id}/${basename}.jpeg`,
        large: `/p/${id}/${basename}.lg.jpeg`,
        small: `/p/${id}/${basename}.sm.jpeg`,
        preview: `/p/${id}/${basename}.pre1x.jpeg`,
        preview2x: `/p/${id}/${basename}.pre2x.jpeg`,
        thumb: `/p/${id}/${basename}.thumb.jpeg`,
      };
    }).filter(Boolean);

    const posterFile = (await glob('poster.{jpeg,jpg,png,gif}', { cwd }))[0];

    let dimensions = null;
    if (posterFile) {
      dimensions = await getDimensions(path.resolve(cwd, posterFile));
    } else if (images.length) {
      dimensions = await getDimensions(path.resolve(cwd, imageFiles[0]));
    }

    if (dimensions) {
      const { width, height } = dimensions;
      dimensions.ratioH = Math.round((height / width) * 100);
      dimensions.ratioW = Math.round((width / height) * 100);

      if (dimensions.ratioH > 100) {
        dimensions.orientation = 'tall';
      } else if (dimensions.ratioH === 100) {
        dimensions.orientation = 'square';
      } else {
        dimensions.orientation = 'wide';
      }
    }

    const poster = posterFile || images.length
      ? {
        max: `/p/${id}/poster.jpeg`,
        lg: `/p/${id}/poster.lg.jpeg`,
        md: `/p/${id}/poster.md.jpeg`,
        sm: `/p/${id}/poster.sm.jpeg`,
        xs: `/p/${id}/poster.xs.jpeg`,
        thumb: `/p/${id}/poster.thumb.jpeg`,
      }
      : null;

    const titlecard = (await glob('titlecard.{jpeg,jpg,png,gif}', { cwd }))[0];

    return { images, poster, dimensions, titlecard };
  });


  return asyncthrough(async (stream, file) => {
    if (!file || file.meta.ignore) return;

    var date = new Date(file.meta.date);
    var cwd = path.dirname(file.path);
    var flags = file.flags = new Set(file.meta.classes || []);
    var isIndexPage = path.basename(file.path) === 'index.md';

    file.meta.slug = file.meta.slug || (file.meta.title && slugify(file.meta.title)) || D.format(date, 'yyyy-MM-dd-HHmm');
    file.meta.url = '/p/' + file.meta.id + '/' + file.meta.slug + '/';
    file.meta.fullurl = siteInfo.rss.site_url + file.meta.url;
    file.meta.originalpath = path.relative(file.cwd, file.path);

    if (!file.meta.slug) {
      log.error(`Post could not produce a slug. (${cwd})`);
      return;
    }

    file.meta.tags = (file.meta.tags || []).reduce((result, tag) => {
      result[slugify(tag)] = tag;
      return result;
    }, {});

    if (isIndexPage) {
      file.meta.subPage = false;
      flags.add('is-index');
    } else {
      file.meta.subPage = path.basename(file.path, file.extname) + '.html';
      flags.add('not-index');
      flags.add('is-subpage');
    }


    if (Object.keys(file.meta.tags).length === 1 && file.meta.tags.ootd) {
      flags.add('is-ootd-only');
    } else {
      flags.add('not-ootd-only');
    }


    if (file.meta.tweet) {
      flags.add('has-tweet');
    }

    const { images, poster, dimensions, titlecard } = await getFileData(file.meta.id, cwd);

    file.meta.images = images;
    file.meta.poster = poster;
    file.meta.dimensions = dimensions;

    if (images.length) {
      flags.add('has-images');
      if (file.meta['no-images']) {
        flags.add('hide-images');
      } else {
        flags.add('show-images');
      }

      if (images.length === 1 && !file.meta['no-single']) {
        flags.add('single-image');
      }
    } else {
      flags.add('no-images');
      flags.add('hide-images');
    }


    if (poster) {
      flags.add('has-poster');
      flags.add('native-poster');
    } else if (images.length) {
      flags.add('has-poster');
      flags.add('derived-poster');
    } else {
      flags.add('no-poster');
    }

    if (file.meta.orientation) {
      flags.add('is-' + file.meta.orientation);
    } else if (dimensions) {
      file.meta.orientation = dimensions.orientation;
      flags.add('is-' + dimensions.orientation);
    }


    if (titlecard) {
      flags.add('has-titlecard');
      file.meta.titlecard = `/p/${file.meta.id}/titlecard.jpeg`;
    } else {
      flags.add('no-titlecard');

      if (!file.meta.titlecard) {
        if (flags.has('is-wide')) file.meta.titlecard = 'middle';
        else if (flags.has('is-tall')) file.meta.titlecard = 'box';
      }

      if (poster || images.length) {
        switch (file.meta.titlecard) {
        case 'top':
        case 'north':
          file.meta.titlecard = `/p/${file.meta.id}/titlecard-north.jpeg`;
          break;
        case 'bottom':
        case 'south':
          file.meta.titlecard = `/p/${file.meta.id}/titlecard-south.jpeg`;
          break;
        case 'center':
        case 'middle':
          file.meta.titlecard = `/p/${file.meta.id}/titlecard-center.jpeg`;
          break;
        case 'box':
          file.meta.titlecard = `/p/${file.meta.id}/titlecard-box.jpeg`;
          break;
        case 'thumb':
        case 'square':
        default:
          file.meta.titlecard = `/p/${file.meta.id}/titlecard-square.jpeg`;
          break;
        }
      } else {
        file.meta.titlecard = null;
      }
    }

    if (!file.meta.carousel) {
      file.meta.carousel = JSON.stringify({ groupCells: true, imagesLoaded: true });
    }

    if (file.meta['no-title']) {
      flags.add('hide-title');
    } else if (file.meta.title || file.meta.description) {
      flags.add('show-title');
    } else {
      flags.add('hide-title');
    }

    if (file.meta.title) {
      flags.add('has-title');
    } else {
      flags.add('no-title');
    }

    if (file.meta.subtitle) {
      flags.add('has-subtitle');
    } else {
      flags.add('no-subtitle');
    }

    if (file.meta.description) {
      flags.add('has-descrip');
    } else {
      flags.add('no-descrip');
    }

    if (file.meta.tweets) {
      flags.add('has-tweets');
    } else {
      flags.add('no-tweets');
    }

    stream.push(file);
  });
}

function parseTweets () {
  const tweeturl = /https?:\/\/twitter\.com\/(?:#!\/)?(?:\w+)\/status(?:es)?\/(\d+)/i;
  const tweetidcheck = /^\d+$/;
  function parseTweetId (tweetid) {
    // we can't trust an id that isn't a string
    if (typeof tweetid !== 'string') return false;

    const match = tweetid.match(tweeturl);
    if (match) return match[1];
    if (tweetid.match(tweetidcheck)) return tweetid;
    return false;
  }

  return collect.list(async (files) => {
    const twitterBackup = (await fs.readJson(path.join(ROOT, 'twitter-backup.json')).catch(() => {})) || {};
    const twitterCache = (await fs.readJson(path.join(ROOT, 'twitter-cache.json')).catch(() => {})) || {};
    const needed = [];

    // first loop through all posts and gather + validate all tweet ids
    for (const file of files) {
      if (!file.meta.tweets && !file.meta.tweet) continue;

      const tweets = [];

      if (file.meta.tweet) {
        file.meta.tweet = [ file.meta.tweet ].flat(1).map(parseTweetId);
        tweets.push(...file.meta.tweet);
      }

      if (file.meta.tweets) {
        file.meta.tweets = file.meta.tweets.map(parseTweetId);
        tweets.push(...file.meta.tweets);
      }

      for (const id of tweets) {
        if (!twitterCache[id]) {
          needed.push(id);
        }
      }

      file.meta.tweets = tweets;
    }

    // if we have tweets we need to add to the cache, do so
    if (needed.length) {
      log('Fetching tweets: ' + needed.join(', '));
      const arriving = await Promise.all(chunk(uniq(needed), 99).map((tweetids) =>
        twitter.get('statuses/lookup', { id: tweetids.join(','), tweet_mode: 'extended' })
          .catch((e) => { log.error(e); return []; }),
      ));

      const loaded = [];
      for (const tweet of arriving.flat(1)) {
        if (!twitterBackup[tweet.id_str]) twitterBackup[tweet.id_str] = tweet;
        twitterCache[tweet.id_str] = tweetparse(tweet);
        loaded.push(tweet.id_str);
      }

      const absent = difference(needed, loaded);
      for (const id of absent) {
        if (twitterBackup[id]) {
          log('Pulled tweet from backup ' + id);
          twitterCache[id] = tweetparse(twitterBackup[id]);
          continue;
        }
        log.error('Could not find tweet ' + id);
      }
    }

    // now loop through posts and substitute the tweet data for the ids
    for (const file of files) {
      if (!file.meta.tweets) continue;

      file.meta.tweets = file.meta.tweets.reduce((dict, tweetid) => {
        if (!twitterCache[tweetid]) log.error(`Tweet ${tweetid} is missing from the cache.`);
        dict[tweetid] = twitterCache[tweetid];
        return dict;
      }, {});

    }

    await fs.writeFile(path.join(ROOT, 'twitter-cache.json'), JSON.stringify(twitterCache, null, 2));
    await fs.writeFile(path.join(ROOT, 'twitter-backup.json'), JSON.stringify(twitterBackup, null, 2));

    return files;
  });
}

function parseContent () {
  return asyncthrough(async (stream, file) => {
    const cwd = path.dirname(file.path);
    const flags = file.flags;
    let original = file.contents.toString('utf8').trim();
    original = original.replace(/\{!\{([\s\S]*?)\}!\}/mg, (match, contents) => {
      try {
        const result = handlebars.compile(contents)({
          ...file.meta,
          meta: file.meta,
          local: {
            cwd,
            root: ROOT,
            basename: file.basename,
          },
        });
        return result;
      } catch (e) {
        log.error(e);
        return '';
      }
    });

    let contents, preview;
    try {
      contents = md.render(original.replace(/<!--[[\]]-->/g, '')).trim();

      preview = striptags(original.replace(/<!--\[[\s\S]*?\]-->/g, ''));
      if (preview.length > 1000) preview = preview.slice(0, 1000) + '…';
      preview = preview ? mdPreview.render(preview) : '';
    } catch (e) {
      log.error(`Error while rendering ${file.path}`, e);
      contents = preview = '';
    }

    file.contents = Buffer.from(contents);
    file.meta.markdown = original;
    file.meta.contents = contents;
    file.meta.preview = preview;
    file.meta.description = typeof file.meta.description === 'string' ? file.meta.description : original.split(/\r?\n/)[0];

    if (contents.length > 2000 || file.meta.long) {
      flags.add('is-extra-long');
    } else if (contents.length > 1000 || file.meta.long) {
      flags.add('is-long');
    } else if (contents.length < 500) {
      flags.add('is-short');
    }

    if (preview) {
      flags.add('has-preview');
      if (preview.length < 400) flags.add('short-preview');
    } else {
      flags.add('no-preview');
    }

    file.meta.classes = Array.from(flags);
    file.meta.flags = file.meta.classes.reduce((res, item) => {
      var camelCased = item.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
      res[camelCased] = true;
      return res;
    }, {});

    file.path = path.join(file.base, file.meta.id, file.meta.slug, path.basename(file.path, file.extname) + '.html');
    stream.push(file);
  });
}

function assembleIndex () {
  var posts = [];
  var indexFile = null;

  return asyncthrough(async (stream, file) => {

    if (!file) return;
    if (!indexFile) {
      indexFile = file.clone();
    }

    if (!file.meta.ignore && file.extname !== '.json') {
      posts.push(file.meta);
    }

  }, async (stream) => {
    if (!indexFile) return;

    const manifest = await fs.readJson(path.join(ROOT, 'rev-manifest.json')).catch(() => {}).then((r) => r || {});

    posts = sortBy(posts, 'date');
    posts.reverse();

    var firstPostIndex = findIndex(posts, 'pinned');
    if (firstPostIndex === -1) firstPostIndex = findIndex(posts, (p) => !p.ootd);
    if (firstPostIndex > 0) {
      const first = posts.splice(firstPostIndex, 1)[0];
      posts.unshift(first);
    }

    function revmatch (url) {
      if (!url) return '';
      if (url[0] === '/') url = url.substr(1);

      if (manifest[url]) return '/' + manifest[url];
      return '/' + url;
    }

    const indexSans = indexFile.clone();
    const postsSans = posts.map((p) => {
      p = omit(p, [ 'markdown', 'contents', 'images', 'products' ]);
      p.poster = p.poster && {
        max:   revmatch(p.poster.max),
        lg:    revmatch(p.poster.lg),
        md:    revmatch(p.poster.md),
        sm:    revmatch(p.poster.sm),
        xs:    revmatch(p.poster.xs),
        thumb: revmatch(p.poster.thumb),
      };
      return p;
    });

    indexFile.path = path.join(ROOT, 'posts.json');
    indexFile.base = ROOT;
    indexFile.contents = Buffer.from(JSON.stringify(posts, null, '  '));

    indexSans.path = path.join(ROOT, 'posts-sans.json');
    indexSans.base = ROOT;
    indexSans.contents = Buffer.from(JSON.stringify(postsSans, null, '  '));

    stream.push(indexFile);
    stream.push(indexSans);

  });
}

function renderPosts () {

  var template = handlebars.compile(String(fs.readFileSync(path.join(ROOT, '/templates/post.hbs.html'))));

  return asyncthrough(async (stream, file) => {
    if (file.meta.ignore) return;
    const datajs = file.clone();
    datajs.contents = Buffer.from(JSON.stringify(file.meta, null, 2));
    datajs.basename = path.basename(file.path, file.extname) + '.json';
    stream.push(datajs);

    try {
      file.contents = Buffer.from(template({
        page: {
          title: file.meta.title + ' :: Curvy & Trans',
        },
        ...file.meta,
        meta: file.meta,
      }));
      stream.push(file);
    } catch (err) {
      log.error('Encountered a crash while compiling ' + file.path, err);
    }

  });
}

exports.posts = function buildPosts () {

  return src('posts/**/*.md')
    .pipe(frontmatter({ property: 'meta' }))
    .pipe(parseMeta())
    .pipe(parseTweets())
    .pipe(parseContent())
    .pipe(renderPosts())
    .pipe(dest(`${DEST}/p/`))
    .pipe(assembleIndex())
    .pipe(dest('./'));
};


/** **************************************************************************************************************** **/


exports.pages = function buildPages () {
  var postIndex;
  try {
    postIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'posts.json')));
  } catch (e) {
    postIndex = [];
  }

  const byState = groupBy(postIndex, (p) => (p.draft ? 'draft' : 'final'));
  postIndex = postIndex.filter((p) => !p.draft);

  const tagMap = {};
  const byTag = reduce(byState.final, (results, p) => {
    const pTags = p.tags || {};
    Object.keys(pTags).forEach((tagslug) => {
      const tag = pTags[tagslug];
      if (!results[tagslug]) {
        results[tagslug] = [];
        tagMap[tagslug] = tag;
      }
      results[tagslug].push(p);
    });
    return results;
  }, {});

  // generate a sorted tag map
  const tags = Object.keys(tagMap).sort().reduce((result, tagslug) => {
    result[tagslug] = tagMap[tagslug];
    return result;
  }, {});

  var posts = {
    all: postIndex,
    loaded: byState.final.slice(0, INITIAL_LOAD),
    final: byState.final,
    drafts: byState.draft,
    tags,
    byTag,
  };

  return src([ 'pages/*' ])
    .pipe(frontmatter({
      property: 'meta',
    }))
    .pipe(asyncthrough(async (stream, file) => {
      var template = handlebars.compile(String(file.contents));

      var data = {
        ...file.meta,
        meta: file.meta,
        page: {
          title: file.meta.title
            ? (file.meta.title + (file.meta.subtitle ? ', ' + file.meta.subtitle : '') + ' :: Curvy & Trans')
            : 'Curvy & Trans',
        },
        posts,
      };

      try {
        file.contents = Buffer.from(String(template(data)));
        stream.push(file);
      } catch (err) {
        log.error('Encountered a crash while compiling ' + file.path, err);
      }

    }))
    .pipe(dest('docs'));
};

/** **************************************************************************************************************** **/


exports.lists = function buildLists () {
  var template = handlebars.compile(String(fs.readFileSync(path.join(ROOT, '/templates/list.hbs.html'))));

  var posts;
  try {
    posts = JSON.parse(fs.readFileSync(path.join(ROOT, 'posts.json')));
  } catch (e) {
    posts = [];
  }

  const postMap = keyBy(posts, 'id');

  return src('lists/*.md')
    .pipe(frontmatter({ property: 'meta' }))
    .pipe(asyncthrough(async (stream, file) => {
      if (!file || file.meta.ignore) return;
      var original = file.contents.toString('utf8').trim();
      var contents = md.render(original);
      file.contents = Buffer.from(contents);

      const cwd = path.join(path.dirname(file.path), path.basename(file.basename, file.extname));

      file.meta.markdown = original;
      file.meta.contents = contents;
      file.meta.id = path.basename(file.basename, file.extname);
      // file.meta.postMap = file.meta.posts.reduce((o, id) => {
      //   o[id] = postMap[id];
      //   return o;
      // }, {});
      file.meta.posts = file.meta.posts.map((id) => postMap[id]).filter(Boolean);

      file.path = path.join(file.base, path.basename(file.basename, file.extname), 'index.html');
      file.meta.url = `/l/${file.meta.id}/`;

      var flags = new Set(file.meta.classes || []);

      const titlecard = (await glob('titlecard.{jpeg,jpg,png,gif}', { cwd }))[0];
      if (file.meta.titlecard) {
        // Titlecard defined in the list metadata
        flags.add('has-titlecard');
        flags.add('defined-titlecard');

        if (file.meta.title.length === 6) {
          // pull titlecard from a post
          const post = postMap[file.meta.titlecard];
          file.meta.titlecard = post.titlecard;
        }
      } else if (titlecard) {
        // Poster defined in the list data folder
        flags.add('has-titlecard');
        file.meta.titlecard = `/l/${file.meta.id}/titlecard.jpeg`;

      } else if (file.meta.posts.length) {
        // Titlecard pulled from first post
        const first = file.meta.posts[0];
        file.meta.titlecard = first.titlecard;
      } else {
        flags.add('no-titlecard');
      }

      const poster = (await glob('poster.{jpeg,jpg,png,gif}', { cwd }))[0];
      if (file.meta.poster) {
        // Poster defined in the list metadata
        if (typeof file.meta.poster === 'string') {
          flags.add('has-poster');
          flags.add('defined-poster');

          if (file.meta.poster.length === 6) {
            // pull poster from a post
            const post = postMap[file.meta.poster];
            file.meta.poster = post.poster;
            file.meta.dimensions = post.dimensions;
            if (post.flags.isTall) flags.add('is-tall');
            if (post.flags.isSquare) flags.add('is-square');
            if (post.flags.isWide) flags.add('is-wide');
          } else {
            // poster is a path
            flags.add('monosize-poster');
            file.meta.poster = {
              only:   file.meta.poster,
            };
          }
        } else if (typeof file.meta.poster === 'object') {
          flags.add('has-poster');
          flags.add('defined-poster');
        } else {
          flags.add('no-poster');
          file.meta.poster = null;
        }

      } else if (poster) {
        // Poster found in a list data folder
        file.meta.dimensions = await getDimensions(path.resolve(cwd, poster));
        flags.add('has-poster');
        flags.add('native-poster');

        file.meta.poster = {
          max:   `/l/${file.meta.id}/poster.jpeg`,
          lg:    `/l/${file.meta.id}/poster.lg.jpeg`,
          md:    `/l/${file.meta.id}/poster.md.jpeg`,
          sm:    `/l/${file.meta.id}/poster.sm.jpeg`,
          xs:    `/l/${file.meta.id}/poster.xs.jpeg`,
          thumb: `/l/${file.meta.id}/poster.thumb.jpeg`,
        };

        if (file.meta.orientation) {
          flags.add('is-' + file.meta.orientation);
        }

        if (file.meta.dimensions) {
          const { width, height } = file.meta.dimensions;
          file.meta.dimensions.ratioH = Math.round((height / width) * 100);
          file.meta.dimensions.ratioW = Math.round((width / height) * 100);

          if (!file.meta.orientation) {
            if (file.meta.dimensions.ratioH > 100) {
              flags.add('is-tall');
            } else if (file.meta.dimensions.ratioH === 100) {
              flags.add('is-square');
            } else {
              flags.add('is-wide');
            }
          }
        }

      } else if (file.meta.posts.length) {
        // Poster pulled from first post
        const first = file.meta.posts[0];
        file.meta.poster = first.poster;
        file.meta.dimensions = first.dimensions;
        flags.add('has-poster');
        flags.add('derived-poster');
        if (first.flags.isTall) flags.add('is-tall');
        if (first.flags.isSquare) flags.add('is-square');
        if (first.flags.isWide) flags.add('is-wide');

      } else {
        // No Poster Found
        flags.add('no-poster');
      }

      stream.push(file);
    }))
    // .pipe(require('./lib/debug')('path'))
    .pipe(asyncthrough(async (stream, file) => {
      const datajs = file.clone();
      datajs.contents = Buffer.from(JSON.stringify(file.meta, null, 2));
      datajs.basename = 'index.json';
      stream.push(datajs);

      try {
        file.contents = Buffer.from(template({
          meta: file.meta,
          page: {
            title: file.meta.title + (file.meta.subtitle ? ', ' + file.meta.subtitle : '') + ' :: Curvy & Trans',
          },
          ...file.meta,
          contents: file.contents.toString(),
        }));
        stream.push(file);
      } catch (err) {
        log.error('Encountered a crash while compiling ' + file.path, err);
      }


    }))
    .pipe(dest(`${DEST}/l/`))
  ;
};
