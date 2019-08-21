
const path = require('path');
const fs = require('fs-extra');
const moment = require('moment');
const { findIndex, sortBy, groupBy, reduce, omit } = require('lodash');
const log = require('fancy-log');
const glob = require('./lib/glob');
const slugify = require('slugify');
const dimensions = require('./lib/dimensions');

const { src, dest } = require('gulp');
const merge       = require('merge-stream');
const frontmatter = require('gulp-front-matter');

const asyncthrough = require('./lib/through');

const md     = require('markdown-it')({
  html: true,
  linkify: true,
  typographer: true,
}).enable('image')
  .use(require('markdown-it-div'))
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

const ROOT = path.dirname(__dirname);
const DEST = './docs';

exports.loadLayout = async function loadLayout () {
  handlebars.registerPartial('layout', handlebars.compile(String(fs.readFileSync(path.join(ROOT, '/templates/layout.hbs.html')))));
  handlebars.registerPartial('cell', handlebars.compile(String(fs.readFileSync(path.join(ROOT, '/templates/cell.hbs.html')))));
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
  handlebars.registerPartial('cell', handlebars.compile(String(fs.readFileSync(path.join(ROOT, '/templates/cell.hbs.html')))));
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
      file.contents = Buffer.from(contents);

      var date = moment(file.meta.date);
      var cwd = path.dirname(file.path);

      file.meta.markdown = original;
      file.meta.contents = contents;
      file.meta.slug = file.meta.slug || (file.meta.title && slugify(file.meta.title, { remove: /[*+~.,()'"!:@/\\]/g }).toLowerCase()) || date.format('YYYY-MM-DD-HHmm');
      file.meta.url = '/p/' + file.meta.id + '/' + file.meta.slug + '/';
      file.meta.fullurl = 'http://curvyandtrans.com' + file.meta.url;
      file.meta.originalpath = path.relative(file.cwd, file.path);
      file.meta.description = typeof file.meta.description === 'string' ? file.meta.description : original.split(/\r?\n/)[0];
      file.meta.classes = file.meta.classes || [];

      file.meta.tags = (file.meta.tags || []).reduce((result, tag) => {
        result[slugify(tag).toLowerCase()] = tag;
        return result;
      }, {});

      if (Object.keys(file.meta.tags).length === 1 && file.meta.tags.ootd) {
        file.meta.classes.push('ootd-only');
        file.meta.ootd = true;
      }

      if (!file.meta.slug) {
        log.error(`Post could not produce a slug. (${cwd})`);
        return;
      }

      const images = await glob('?({0..9}){0..9}.{jpeg,jpg,png,gif,m4v}', {
        cwd: path.dirname(file.path),
      });

      if (images.length) {
        file.meta.images = images.map((imgpath) => {
          const ext = path.extname(imgpath);
          const basename = path.basename(imgpath, ext);
          if (ext === '.m4v') {
            return `/p/${file.meta.id}/${basename}.m4v`;
          }

          return `/p/${file.meta.id}/${basename}.jpeg`;
        });
      } else {
        file.meta.noimages = true;
      }

      const titlecard = (await glob('titlecard.{jpeg,jpg,png,gif}', { cwd }))[0];

      if (titlecard) {
        file.meta.thumbnail = `/p/${file.meta.id}/${path.basename(titlecard)}`;
      } else {
        file.meta.thumbnail = `/p/${file.meta.id}/titlecard-thumb.png`;

        switch (file.meta.titlecard) {
        case 'top':
          file.meta.titlecard = `/p/${file.meta.id}/titlecard-north.png`;
          break;
        case 'bottom':
          file.meta.titlecard = `/p/${file.meta.id}/titlecard-south.png`;
          break;
        case 'center':
          file.meta.titlecard = `/p/${file.meta.id}/titlecard-center.png`;
          break;
        case 'thumb':
        default:
          file.meta.titlecard = `/p/${file.meta.id}/titlecard-thumb.png`;
          break;
        }
      }

      const poster = (await glob('poster.{jpeg,jpg,png,gif}', { cwd }))[0];

      if (poster) {
        file.meta.poster = `/p/${file.meta.id}/poster.jpeg`;
        file.meta.dimensions = await dimensions(path.resolve(cwd, poster));
      } else if (images.length) {
        file.meta.poster = file.meta.images[0];
        file.meta.dimensions = await dimensions(path.resolve(cwd, images[0]));
      }

      if (file.meta.dimensions) {
        const { width, height } = file.meta.dimensions;
        file.meta.dimensions.ratio = Math.round((height / width) * 100);
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

      if (file.meta.span < 8 && typeof file.meta.shortCard === 'undefined') {
        file.meta.shortCard = true;
      }

      if (file.meta.shortCard) {
        file.meta.span += 2;
      }

      if (contents.length > 2000 && typeof file.meta.long === 'undefined') {
        file.meta.long = true;
      }

      if (images.length === 1 && typeof file.meta.single === 'undefined') {
        file.meta.single = true;
      }

      file.path = file.base + '/' + file.meta.id + '/' + file.meta.slug + '/index.html';
      stream.push(file);
    }))
  ;

  var postFiles = readPosts
    .pipe(asyncthrough(async (stream, file) => {
      if (!file.meta.ignore) {
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
    .pipe(dest(`${DEST}/p/`));
  ;

  var posts = [];
  var indexFile = null;
  var indexStream = postFiles.pipe(asyncthrough(async (stream, file) => {

    if (!file) return;
    if (!indexFile) {
      indexFile = file.clone();
    }

    if (!file.meta.ignore) {
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
    };

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
