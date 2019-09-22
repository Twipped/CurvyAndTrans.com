
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

const ROOT = path.dirname(__dirname);
const DEST = './docs';

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
}).use(require('./lib/markdown-token-filter'))
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
  handlebars.registerPartial('indexCell', handlebars.compile(String(fs.readFileSync(path.join(ROOT, '/templates/index-cell.hbs.html')))));
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
  handlebars.registerPartial('indexCell', handlebars.compile(String(fs.readFileSync(path.join(ROOT, '/templates/index-cell.hbs.html')))));
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

      var preview = striptags(original).slice(0, 1000);
      preview = preview && mdPreview.render(preview + '…');

      var date = moment(file.meta.date);
      var cwd = path.dirname(file.path);
      var flags = new Set(file.meta.classes || []);

      file.contents = Buffer.from(contents);
      file.meta.markdown = original;
      file.meta.contents = contents;
      file.meta.preview = preview;
      file.meta.slug = file.meta.slug || (file.meta.title && slugify(file.meta.title, { remove: /[*+~.,()'"!:@/\\]/g }).toLowerCase()) || date.format('YYYY-MM-DD-HHmm');
      file.meta.url = '/p/' + file.meta.id + '/' + file.meta.slug + '/';
      file.meta.fullurl = 'http://curvyandtrans.com' + file.meta.url;
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
              full: `/p/${file.meta.id}/${basename}.m4v`
            };
          }

          return {
            type: 'image',
            full: `/p/${file.meta.id}/${basename}.jpeg`,
            small: `/p/${file.meta.id}/${basename}.sm.jpeg`,
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

      const titlecard = (await glob('titlecard.{jpeg,jpg,png,gif}', { cwd }))[0];

      if (titlecard) {
        flags.add('has-titlecard');
        file.meta.thumbnail = `/p/${file.meta.id}/titlecard.png`;
      } else {
        file.meta.thumbnail = `/p/${file.meta.id}/titlecard-thumb.png`;
        flags.add('no-titlecard');

        switch (file.meta.titlecard) {
        case 'top':
        case 'north':
          file.meta.titlecard = `/p/${file.meta.id}/titlecard-north.png`;
          break;
        case 'bottom':
        case 'south':
          file.meta.titlecard = `/p/${file.meta.id}/titlecard-south.png`;
          break;
        case 'center':
        case 'middle':
          file.meta.titlecard = `/p/${file.meta.id}/titlecard-center.png`;
          break;
        case 'thumb':
        case 'square':
        default:
          file.meta.titlecard = `/p/${file.meta.id}/titlecard-square.png`;
          break;
        }
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

      file.meta.poster = `/p/${file.meta.id}/poster.jpeg`;

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

        if (!file.meta.span) {
          file.meta.span = Math.ceil((height / width) * 10);
        }
        if (!file.meta.spanLarge) {
          file.meta.spanLarge = Math.ceil((height / width) * 10) * 2;
        }
      } else {
        file.meta.span = 10;
        file.meta.spanLarge = 20;
      }

      if (contents.length > 2000 || file.meta.long) {
        flags.add('is-extra-long');
      } else if (contents.length > 1000 || file.meta.long) {
        flags.add('is-long');
      } else if (contents.length < 500) {
        flags.add('is-short');
      }

      if (!file.meta.carousel) {
        file.meta.carousel = JSON.stringify({ groupCells: true });
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
      p.poster = revmatch(p.poster);
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

  const first = byState.final[0];
  var posts = {
    all: postIndex,
    ordered: byState.final,
    first,
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
        page: { title: file.meta.title ? file.meta.title + ' :: Curvy & Trans' : 'Curvy & Trans' },
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

      file.meta.markdown = original;
      file.meta.contents = contents;
      file.meta.posts = file.meta.posts.map((id) => postMap[id]).filter(Boolean);

      file.path = path.join(file.base, path.basename(file.basename, file.extname), 'index.html');

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
            title: file.meta.title + ' :: Curvy & Trans',
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
