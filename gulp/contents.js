
const path = require('path');
const fs = require('fs-extra');
const moment = require('moment');
const { find, without, sortBy, groupBy, reduce } = require('lodash');
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

const ROOT = path.dirname(__dirname);
const DEST = './docs';

exports.loadLayout = async function loadLayout () {
  handlebars.registerPartial('layout', handlebars.compile(String(fs.readFileSync(path.join(ROOT, '/templates/layout.hbs.html')))));
  handlebars.registerPartial('cell', handlebars.compile(String(fs.readFileSync(path.join(ROOT, '/templates/cell.hbs.html')))));
  handlebars.registerHelper('rev', (url) => {
    if (url[0] === '/') url = url.substr(1);
    return '/' + url;
  });
};

exports.loadLayout.prod = async function loadLayoutForProd () {
  var manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'rev-manifest.json')));
  } catch (e) {
    manifest = {};
  }

  handlebars.registerPartial('layout', handlebars.compile(String(fs.readFileSync(path.join(ROOT, '/templates/layout.hbs.html')))));
  handlebars.registerPartial('cell', handlebars.compile(String(fs.readFileSync(path.join(ROOT, '/templates/cell.hbs.html')))));
  handlebars.registerHelper('rev', (url) => {
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

      if (!file.meta.slug) {
        log.error(`Post could not produce a slug. (${cwd})`);
        return;
      }

      const images = await glob('?({0..9}){0..9}.{jpeg,jpg,png,gif,m4v}', {
        cwd: path.dirname(file.path),
      });

      if (!images.length) {
        log.error(`Post is missing images, skipping. (${cwd})`);
        return;
      }

      file.meta.images = images.map((imgpath) => {
        const ext = path.extname(imgpath);
        const basename = path.basename(imgpath, ext);
        if (ext === '.m4v') {
          return `/p/${file.meta.id}/${basename}.m4v`;
        }

        return `/p/${file.meta.id}/${basename}.jpeg`;
      });

      const titlecard = (await glob('titlecard.{jpeg,jpg,png,gif}', { cwd }))[0];

      if (titlecard) {
        file.meta.thumbnail = `/p/${file.meta.id}/${path.basename(titlecard)}`;
      } else {
        file.meta.thumbnail = `/p/${file.meta.id}/titlecard-thumb.png`;

        switch (file.meta.titlecard) {
        case 'top':
          file.meta.titlecard = `/p/${file.meta.id}/titlecard-north.png`;
          break;
        case 'thumb':
          file.meta.titlecard = `/p/${file.meta.id}/titlecard-thumb.png`;
          break;
        case 'center':
        default:
          file.meta.titlecard = `/p/${file.meta.id}/titlecard-center.png`;
          break;
        }
      }

      const poster = (await glob('poster.{jpeg,jpg,png,gif}', { cwd }))[0];

      if (poster) {
        file.meta.poster = `/p/${file.meta.id}/poster.jpeg`;
        file.meta.dimensions = await dimensions(path.resolve(cwd, poster));
      } else {
        file.meta.poster = file.meta.images[0];
        file.meta.dimensions = await dimensions(path.resolve(cwd, images[0]));
      }
      const { width, height } = file.meta.dimensions;
      file.meta.dimensions.ratio = Math.round((height / width) * 100);
      if (!file.meta.span) {
        file.meta.span = Math.ceil((height / width) * 10);
      }
      if (!file.meta.spanLarge) {
        file.meta.spanLarge = Math.ceil((height / width) * 10) * 2;
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
        file.contents = Buffer.from(template({
          page: {
            title: file.meta.title + ' :: Curvy & Trans',
          },
          ...file.meta,
        }));
        stream.push(file);
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

    posts = sortBy(posts, 'date');
    posts.reverse();
    indexFile.path = path.join(DEST, 'posts.json');
    indexFile.base = ROOT;
    indexFile.contents = Buffer.from(JSON.stringify(posts, null, '  '));
    stream.push(indexFile);

  })).pipe(dest('./'));

  return merge(postFiles, indexStream);
};


/** **************************************************************************************************************** **/


exports.pages = function buildPages () {
  var postIndex;
  try {
    postIndex = JSON.parse(fs.readFileSync(path.join(DEST, 'posts.json')));
  } catch (e) {
    postIndex = [];
  }

  const byState = groupBy(postIndex, (p) => (p.draft ? 'draft' : 'final'));
  postIndex = postIndex.filter((p) => !p.draft);

  const pinned = find(postIndex, 'pinned');
  const byTag = reduce(byState.final, (results, p) => {
    const tags = p.tags || [];
    tags.forEach((tag) => {
      if (!results[tag]) results[tag] = [];
      results[tag].push(p);
    });
    return results;
  }, {});
  const tags = Object.keys(byTag).sort();

  var posts;
  if (pinned) {
    const ordered = without(byState.final, pinned);
    posts = {
      all: postIndex,
      ordered: [ pinned, ...ordered ],
      first: pinned,
      drafts: byState.draft,
      tags,
      byTag,
    };
  } else {
    const [ first, ...ordered ] = byState.final;
    posts = {
      all: postIndex,
      ordered,
      first,
      drafts: byState.draft,
      tags,
      byTag,
    };
  }

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

      var html = template(data);

      html = String(html);

      file.contents = Buffer.from(html);
      stream.push(file);
    }))
    .pipe(dest('docs'));
};
