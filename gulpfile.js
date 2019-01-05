
const argv = require('minimist')(process.argv.slice(2));
const path = require('path');
const fs = require('fs-extra');
const moment = require('moment');
const random = require('./lib/random');
const { stripIndent } = require('common-tags');
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

const { src, dest, series, parallel, watch } = require('gulp');
const resizer     = require('gulp-image-resize');
const merge       = require('merge-stream');
const rename      = require('gulp-rename');
const frontmatter = require('gulp-front-matter');
const scss        = require('gulp-sass');
// const minifyCSS   = require('gulp-minify-css');
const clean       = require('gulp-clean');
var awspublish    = require('gulp-awspublish');
var parallelize   = require('concurrent-transform');

var credentials = require('./aws.json');

var through = require('through2');
var md     = require('markdown-it')({
  html: true,
  linkify: true,
  typographer: true,
}).enable('image');

// var debug = through.obj(function (file, end, next) {
//   log({ ...file, path: file.path, relative: file.relative, base: file.base });
//   this.push(file);
//   next();
// });

const asyncthrough = function (fn) {
  return through.obj(function (file, enc, next) {
    fn(this, file, enc).then(() => next(), (err) => { log.error(err, 'Error thrown'); next(err); });
  });
};

var handlebars = require('handlebars');
require('helper-hoard').load(handlebars);

const ROOT = __dirname;
const DEST = './docs';

exports.clean = function distclean () {
  return src('docs', { read: false })
    .pipe(clean());
};

/** **************************************************************************************************************** **/


exports.sass = function sass () {
  return src('scss/*.scss')
    .pipe(scss({
      includePaths: [ path.join(__dirname, 'node_modules') ],
    }).on('error', log.error))
    .pipe(dest(DEST));
};


/** **************************************************************************************************************** **/

exports.loadLayout = function loadLayout (cb) {
  handlebars.registerPartial('layout', handlebars.compile(String(fs.readFileSync(path.join(__dirname, '/templates/layout.hbs.html')))));
  cb();
};

exports.posts = function buildPosts () {

  var template = handlebars.compile(String(fs.readFileSync(path.join(__dirname, '/templates/post.hbs.html'))));

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
    postIndex = JSON.parse(fs.readFileSync(path.join(__dirname, '/posts.json')));
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

/** **************************************************************************************************************** **/


exports.imageScale = function imageScale () {
  var fullsize = src('posts/**/{1..9}.{jpeg,jpg,png,gif}')
    .pipe(resizer({
      format: 'jpeg',
      width: 1000,
      crop: false,
    }));

  var posters = src('posts/**/poster.{jpeg,jpg,png,gif}')
    .pipe(resizer({
      format: 'jpeg',
      width: 1000,
      crop: false,
    }));

  var titlecardNorth = src('posts/**/1.{jpeg,jpg,png,gif}')
    .pipe(resizer({
      format: 'png',
      width: 1000,
      height: 525,
      gravity: 'North',
      crop: true,
    }))
    .pipe(rename((file) => {
      file.basename = 'titlecard-north';
    }));

  var titlecardCenter = src('posts/**/1.{jpeg,jpg,png,gif}')
    .pipe(resizer({
      format: 'png',
      width: 1000,
      height: 525,
      gravity: 'Center',
      crop: true,
    }))
    .pipe(rename((file) => {
      file.basename = 'titlecard-center';
    }));

  var thumbnail = src('posts/**/1.{jpeg,jpg,png,gif}')
    .pipe(resizer({
      format: 'png',
      width: 400,
      height: 400,
      crop: true,
    }))
    .pipe(rename((file) => {
      file.basename = 'titlecard-thumb';
    }));

  var other = src([
    'posts/**/*.{jpeg,jpg,png,gif}',
    '!posts/**/poster.{jpeg,jpg,png,gif}',
    '!posts/**/{1..9}.{jpeg,jpg,png,gif}'
  ]);

  return merge(fullsize, posters, titlecardNorth, titlecardCenter, thumbnail, other)
    .pipe(rename((file) => {
      const hash = file.dirname.split('.')[2];
      file.dirname = hash;
    }))
    .pipe(dest(`${DEST}/p/`));
};


/** **************************************************************************************************************** **/

exports.content = series(
  exports.loadLayout, exports.posts, exports.pages
);

exports.build = parallel(
  exports.content,
  exports.imageScale,
  exports.sass
);

/** **************************************************************************************************************** **/


exports.new = async function newPost () {
  var date = argv.date ? moment(argv.date) : moment();

  var id = random.id().substr(-6).toUpperCase();
  var fname = date.format('YYYY-MM-DD.HHmm.') + id;

  var target = path.join(ROOT, 'posts', fname);

  await fs.ensureDir(target);

  var contents = stripIndent`
    ---
    id: "${id}"
    date: "${date.toISOString()}"
    title: "Outfit of the Day for ${date.format('MMM Do, YYYY')}"
    description:
    tags:
      - OOTD
    products:
      "Description": https://www.amazon.com/exec/obidos/ASIN/A000000000/curvyandtrans-20
    ---

  `;

  await fs.writeFile(path.join(target, 'index.md'), contents);

  log('Created new post at posts/' + fname);
};

/** **************************************************************************************************************** **/

exports.deploy = function s3deploy () {
  var publisher = awspublish.create(credentials);

  return src(`${DEST}/**/*`)
    .pipe(awspublish.gzip())
    .pipe(parallelize(publisher.publish(), 10))
    .pipe(publisher.sync())
    .pipe(awspublish.reporter());
};

/** **************************************************************************************************************** **/

exports.watcher = function watcher () {

  watch([ 'posts/**/index.md', 'posts/**/{1..9}.{jpeg,jpg,png,gif}', 'templates/*.html' ], series(exports.loadLayout, exports.posts, exports.pages));
  watch([ 'pages/*', '!pages/*.md', 'templates/*.html' ], series(exports.loadLayout, exports.pages));
  watch('scss/*.scss', exports.sass);

  var forever = require('forever');
  var srv = new forever.Monitor('server.js');
  srv.start();
  forever.startServer(srv);

};


exports.watch = series(exports.loadLayout, exports.posts, exports.pages, exports.watcher);

/** **************************************************************************************************************** **/

exports.default = series(exports.clean, exports.build, exports.watcher);
