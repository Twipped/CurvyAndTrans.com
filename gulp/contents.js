
const path = require('path');
const fs = require('fs-extra');
const moment = require('moment');
var { promisify } = require('util');
var { find, without, sortBy } = require('lodash');
const log = require('fancy-log');
const globo = require('glob');
const glob = function (pattern, options) {
  return new Promise((resolve, reject) => {
    globo(pattern, options, (err, files) => (err ? reject(err) : resolve(files)));
  });
};
const slugify = require('slugify');
var dimensions = promisify(require('image-size'));

const { src, dest } = require('gulp');
const merge       = require('merge-stream');
const frontmatter = require('gulp-front-matter');

var through = require('through2');
var md     = require('markdown-it')({
  html: true,
  linkify: true,
  typographer: true,
}).enable('image');

const asyncthrough = function (fn) {
  return through.obj(function (file, enc, next) {
    fn(this, file, enc).then(() => next(), (err) => { log.error(err, 'Error thrown'); next(err); });
  });
};

var handlebars = require('handlebars');
require('helper-hoard').load(handlebars);

const ROOT = path.dirname(__dirname);
const DEST = './docs';


/** **************************************************************************************************************** **/


/** **************************************************************************************************************** **/

exports.loadLayout = function loadLayout (cb) {
  handlebars.registerPartial('layout', handlebars.compile(String(fs.readFileSync(path.join(ROOT, '/templates/layout.hbs.html')))));
  cb();
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

      const images = await glob('{1..9}.{jpeg,jpg,png,gif}', {
        cwd: path.dirname(file.path),
      });

      if (!images.length) {
        log.error(`Post is missing images, skipping. (${cwd})`);
        return;
      }

      file.meta.images = images.map((imgpath) => {
        const basename = path.basename(imgpath, path.extname(imgpath));
        return `/p/${file.meta.id}/${basename}.jpeg`;
      });

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

      if (contents.length > 1000) {
        file.meta.long = true;
      }

      file.path = file.base + '/' + file.meta.id + '/' + file.meta.slug + '/index.html';
      stream.push(file);
    }))
  ;

  var postFiles = readPosts
    .pipe(through.obj(function (file, enc, next) {
      if (!file.meta.ignore) {
        file.contents = Buffer.from(template({
          page: {
            title: file.meta.title + ' :: Curvy and Trans',
          },
          ...file.meta,
        }));
        this.push(file);
      }
      next();
    }))
    .pipe(dest(`${DEST}/p/`));
  ;

  var posts = [];
  var indexFile = null;
  var indexStream = postFiles.pipe(through.obj(function transform (file, enc, next) {

    if (!file) return next();
    if (!indexFile) {
      indexFile = file.clone();
    }

    if (!file.meta.ignore && !file.meta.draft) {
      posts.push(file.meta);
    }
    next();
  }, function flush (next) {
    if (!indexFile) return next();

    posts = sortBy(posts, 'date');
    posts.reverse();
    indexFile.path = path.join(ROOT, 'posts.json');
    indexFile.base = ROOT;
    indexFile.contents = Buffer.from(JSON.stringify(posts, null, '  '));
    this.push(indexFile);
    next();
  })).pipe(dest('./'));

  return merge(postFiles, indexStream);
};


/** **************************************************************************************************************** **/


exports.pages = function buildPages () {
  var postIndex;
  try {
    postIndex = JSON.parse(fs.readFileSync(path.join(ROOT, '/posts.json')));
  } catch (e) {
    postIndex = [];
  }

  var posts;
  var pinned = find(postIndex, 'pinned');
  if (pinned) {
    const ordered = without(postIndex, pinned);
    posts = {
      all: postIndex,
      ordered: [ pinned, ...ordered ],
      first: pinned,
    };
  } else {
    const [ first, ...ordered ] = postIndex;
    posts = {
      all: postIndex,
      ordered,
      first,
    };
  }

  return src([ 'pages/*', '!pages/*.md' ])
    .pipe(frontmatter({
      property: 'meta',
    }))
    .pipe(through.obj(function (file, enc, next) {
      var template = handlebars.compile(String(file.contents));

      var data = {
        ...file.meta,
        page: { title: file.meta.title ? file.meta.title + ' :: Curvy and Trans' : 'Curvy and Trans' },
        posts,
      };

      var html = template(data);

      html = String(html);

      file.contents = Buffer.from(html);
      this.push(file);
      next();
    }))
    .pipe(dest('docs'));
};
