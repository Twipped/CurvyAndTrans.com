
const path = require('path');
const fs = require('fs-extra');
const moment = require('moment');
const { findIndex, sortBy, groupBy, keyBy, reduce, omit } = require('lodash');
const log = require('fancy-log');
const glob = require('./lib/glob');
const slugify = require('slugify');
const dimensions = require('./lib/dimensions');

const { src, dest } = require('gulp');
const merge       = require('merge-stream');
const frontmatter = require('gulp-front-matter');

const asyncthrough = require('./lib/through');

const INITIAL_LOAD = 20;
const ROOT = path.dirname(__dirname);
const DEST = './docs';

const { siteInfo } = require('../package.json');

const markdown = require('markdown-it');
const striptags = require('string-strip-html');

const md     = markdown({
  html: true,
  linkify: true,
  typographer: true,
}).enable('image')
  .use(require('markdown-it-div'))
  .use(require('markdown-it-include'), path.join(ROOT, '/includes'))
;

const mdPreview = markdown({
  html: false,
  linkify: false,
  typographer: true,
})
  .use(require('markdown-it-div'))
  .use(require('./lib/markdown-token-filter'))
;

const handlebars = require('handlebars');
require('helper-hoard').load(handlebars);
handlebars.registerHelper('get', (target, key) => (target ? target[key] : undefined));
handlebars.registerHelper('odd', (value, options) => {
  const result = !!value % 2;
  if (!options.fn) return result;
  return result ? options.fn(this) : options.inverse(this);
});
handlebars.registerHelper('even', (value, options) => {
  const result = !(value % 2);
  if (!options.fn) return result;
  return result ? options.fn(this) : options.inverse(this);
});
exports.loadLayout = async function loadLayout () {
  handlebars.registerPartial('layout', handlebars.compile(String(fs.readFileSync(path.join(ROOT, '/templates/layout.hbs.html')))));
  handlebars.registerPartial('indexCard', handlebars.compile(String(fs.readFileSync(path.join(ROOT, '/templates/index-card.hbs.html')))));
  handlebars.registerPartial('indexGrid', handlebars.compile(String(fs.readFileSync(path.join(ROOT, '/templates/index-grid.hbs.html')))));
  handlebars.registerHelper('rev', (url) => {
    if (!url) return '';
    if (url[0] === '/') url = url.substr(1);
    return '/' + url;
  });
};

exports.loadLayout.prod = async function loadLayoutForProd () {
  var manifest;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(ROOT, 'rev-manifest.json')));
  } catch (e) {
    manifest = {};
  }

  handlebars.registerPartial('layout', handlebars.compile(String(fs.readFileSync(path.join(ROOT, '/templates/layout.hbs.html')))));
  handlebars.registerPartial('indexCard', handlebars.compile(String(fs.readFileSync(path.join(ROOT, '/templates/index-card.hbs.html')))));
  handlebars.registerPartial('indexGrid', handlebars.compile(String(fs.readFileSync(path.join(ROOT, '/templates/index-grid.hbs.html')))));
  handlebars.registerHelper('rev', (url) => {
    if (!url) return '';
    if (url[0] === '/') url = url.substr(1);

    if (manifest[url]) return '/' + manifest[url];
    return '/' + url;
  });
};

exports.posts = function buildPosts () {

  var template = handlebars.compile(String(fs.readFileSync(path.join(ROOT, '/templates/post.hbs.html'))));

  var readPosts = src('posts/**/index.md')
    .pipe(frontmatter({
      property: 'meta',
    }))
    .pipe(asyncthrough(async (stream, file) => {
      if (!file || file.meta.ignore) return;
      var original = file.contents.toString('utf8').trim();
      var contents = md.render(original);

      var preview = original;
      preview = preview.replace(/<!--\[[\s\S]*\]-->/g, '');
      if (file.meta.tweet) preview = preview.replace(file.meta.tweet.trim(), '');
      preview = striptags(preview);
      if (preview.length > 1000) preview = preview.slice(0, 1000) + '…';
      preview = preview ? mdPreview.render(preview) : '';

      var date = moment(file.meta.date);
      var cwd = path.dirname(file.path);
      var flags = new Set(file.meta.classes || []);

      file.contents = Buffer.from(contents);
      file.meta.markdown = original;
      file.meta.contents = contents;
      file.meta.preview = preview;
      file.meta.slug = file.meta.slug || (file.meta.title && slugify(file.meta.title, { remove: /[*+~.,()'"!:@/\\]/g }).toLowerCase()) || date.format('YYYY-MM-DD-HHmm');
      file.meta.url = '/p/' + file.meta.id + '/' + file.meta.slug + '/';
      file.meta.fullurl = siteInfo.rss.site_url + file.meta.url;
      file.meta.originalpath = path.relative(file.cwd, file.path);
      file.meta.description = typeof file.meta.description === 'string' ? file.meta.description : original.split(/\r?\n/)[0];

      if (!file.meta.slug) {
        log.error(`Post could not produce a slug. (${cwd})`);
        return;
      }

      file.meta.tags = (file.meta.tags || []).reduce((result, tag) => {
        result[slugify(tag).toLowerCase()] = tag;
        return result;
      }, {});


      if (Object.keys(file.meta.tags).length === 1 && file.meta.tags.ootd) {
        flags.add('is-ootd-only');
      } else {
        flags.add('not-ootd-only');
      }


      if (file.meta.tweet) {
        file.meta.tweet = file.meta.tweet
          .replace(/<script[^>]*>(.*?)<\/script>/g, '')
        ;
        flags.add('has-tweet');
      }

      const images = await glob('?({0..9}){0..9}.{jpeg,jpg,png,gif,m4v}', {
        cwd: path.dirname(file.path),
      });

      if (images.length) {
        file.meta.images = images.map((imgpath) => {
          const ext = path.extname(imgpath);
          const basename = path.basename(imgpath, ext);
          if (ext === '.m4v') {
            return {
              type: 'movie',
              full: `/p/${file.meta.id}/${basename}.m4v`,
            };
          }

          return {
            type: 'image',
            full: `/p/${file.meta.id}/${basename}.jpeg`,
            large: `/p/${file.meta.id}/${basename}.lg.jpeg`,
            small: `/p/${file.meta.id}/${basename}.sm.jpeg`,
            preview: `/p/${file.meta.id}/${basename}.pre1x.jpeg`,
            preview2x: `/p/${file.meta.id}/${basename}.pre2x.jpeg`,
            thumb: `/p/${file.meta.id}/${basename}.thumb.jpeg`,
          };
        });
        flags.add('has-images');
        if (file.meta['no-images']) {
          flags.add('hide-images');
        } else {
          flags.add('show-images');
        }

        if (images.length === 1) {
          flags.add('single-image');
        }

      } else {
        flags.add('no-images');
        flags.add('hide-images');
      }

      const poster = (await glob('poster.{jpeg,jpg,png,gif}', { cwd }))[0];

      if (poster) {
        file.meta.dimensions = await dimensions(path.resolve(cwd, poster));
        flags.add('has-poster');
        flags.add('native-poster');
      } else if (images.length) {
        flags.add('has-poster');
        flags.add('derived-poster');
        file.meta.dimensions = await dimensions(path.resolve(cwd, images[0]));
      } else {
        flags.add('no-poster');
      }

      file.meta.poster = {
        max: `/p/${file.meta.id}/poster.jpeg`,
        lg: `/p/${file.meta.id}/poster.lg.jpeg`,
        md: `/p/${file.meta.id}/poster.md.jpeg`,
        sm: `/p/${file.meta.id}/poster.sm.jpeg`,
        xs: `/p/${file.meta.id}/poster.xs.jpeg`,
        thumb: `/p/${file.meta.id}/poster.thumb.jpeg`,
      };

      if (file.meta.orientation) {
        flags.add('is-' + file.meta.orientation);
      }

      if (file.meta.dimensions && !file.meta.tweet) {
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

      const titlecard = (await glob('titlecard.{jpeg,jpg,png,gif}', { cwd }))[0];

      if (titlecard) {
        flags.add('has-titlecard');
        file.meta.titlecard = `/p/${file.meta.id}/titlecard.jpeg`;
      } else {
        flags.add('no-titlecard');

        if (!file.meta.titlecard) {
          if (flags.has('is-wide')) file.meta.titlecard = 'middle';
          else if (flags.has('is-tall')) file.meta.titlecard = 'box';
        }

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
      }

      if (contents.length > 2000 || file.meta.long) {
        flags.add('is-extra-long');
      } else if (contents.length > 1000 || file.meta.long) {
        flags.add('is-long');
      } else if (contents.length < 500) {
        flags.add('is-short');
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

      file.path = file.base + '/' + file.meta.id + '/' + file.meta.slug + '/index.html';
      stream.push(file);
    }))
  ;

  var postFiles = readPosts
    .pipe(asyncthrough(async (stream, file) => {
      if (!file.meta.ignore) {
        const datajs = file.clone();
        datajs.contents = Buffer.from(JSON.stringify(file.meta, null, 2));
        datajs.basename = 'index.json';
        stream.push(datajs);

        try {
          file.contents = Buffer.from(template({
            page: {
              title: file.meta.title + ' :: Curvy & Trans',
            },
            ...file.meta,
          }));
          stream.push(file);
        } catch (err) {
          log.error('Encountered a crash while compiling ' + file.path, err);
        }
      }
    }))
    .pipe(dest(`${DEST}/p/`))
  ;

  var posts = [];
  var indexFile = null;
  var indexStream = postFiles.pipe(asyncthrough(async (stream, file) => {

    if (!file) return;
    if (!indexFile) {
      indexFile = file.clone();
    }

    if (!file.meta.ignore && file.extname !== '.json') {
      posts.push(file.meta);
    }

  }, async (stream) => {
    if (!indexFile) return;

    var manifest;
    try {
      manifest = JSON.parse(await fs.readFileSync(path.join(ROOT, 'rev-manifest.json')));
    } catch (e) {
      manifest = {};
    }

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
      p.poster = {
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


  })).pipe(dest('./'));

  return merge(postFiles, indexStream);
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
      file.meta.posts = file.meta.posts.map((id) => postMap[id]).filter(Boolean);

      file.path = path.join(file.base, path.basename(file.basename, file.extname), 'index.html');
      file.meta.url = `/l/${file.meta.id}/`;

      var flags = new Set(file.meta.classes || []);

      const titlecard = (await glob('titlecard.{jpeg,jpg,png,gif}', { cwd }))[0];
      if (file.meta.titlecard) {
        // Titlecard defined in the list metadata
        flags.add('has-titlecard');
        flags.add('defined-titlecard');
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
          flags.add('monosize-poster');
          file.meta.poster = {
            only:   file.meta.poster,
          };
        } else if (typeof file.meta.poster === 'object') {
          flags.add('has-poster');
          flags.add('defined-poster');
        } else {
          flags.add('no-poster');
          file.meta.poster = null;
        }

      } else if (poster) {
        // Poster found in a list data folder
        file.meta.dimensions = await dimensions(path.resolve(cwd, poster));
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
