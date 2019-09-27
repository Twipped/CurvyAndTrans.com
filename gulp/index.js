
const { series, parallel, watch } = require('gulp');

/** **************************************************************************************************************** **/

var { loadLayout, posts, pages, lists } = require('./contents');
var contentTask = series( loadLayout, posts, pages, lists );
exports.posts = series( loadLayout, posts );
exports.lists = series( loadLayout, lists );
exports.content = contentTask;

const rssTask = require('./atom');
exports.atom = rssTask;

var images = require('./imgflow');
function imagesProd () {
  return images({ rev: true });
}
exports.images = images;
exports['images-prod'] = imagesProd;

const filesTask = require('./files');
exports.files = filesTask;

var scssTask = require('./scss');
exports.scss = scssTask;

var jsTask = require('./scripts');
exports.js = jsTask;

var jsRollupTask = require('./rollup');
exports.jsr = jsRollupTask;


var cleanTask = require('./clean');
exports.clean = cleanTask;
exports['clean-cache'] = cleanTask.cache;
exports['clean-titlecards'] = cleanTask.titlecard;

const pushToProd = require('./publish');
exports.push = pushToProd;

const cloudfront = require('./cloudfront');
exports.cloudfront = cloudfront;

/** **************************************************************************************************************** **/

exports.new = require('./new');

var buildTask = series(
  imagesProd,
  scssTask.prod,
  jsTask.prod,
  filesTask.prod,
  loadLayout.prod,
  posts,
  jsRollupTask.prod,
  loadLayout.prod,
  pages,
  lists,
  rssTask
);

var devBuildTask = series(
  parallel(
    images,
    scssTask,
    jsTask,
    filesTask
  ),
  loadLayout,
  posts,
  jsRollupTask,
  pages,
  lists,
  rssTask
);

exports.dev = devBuildTask;
exports.prod = buildTask;
exports.publish = series(
  cleanTask,
  buildTask,
  pushToProd,
  cloudfront.prod
);
exports.testpush = pushToProd.dryrun;

/** **************************************************************************************************************** **/

function watcher () {

  watch([
    'posts/**/index.md',
    // 'posts/**/?({0..9}){0..9}.{jpeg,jpg,png,gif}',
    'templates/*.html',
    'pages/*',
    '!pages/*.md',
    'includes/*.md',
  ], contentTask);

  watch('lists/*.md', exports.lists);
  watch('scss/*.scss', scssTask);
  watch('js/*.js', jsTask);
  watch([ 'js-rollup/*.js', 'templates/cell.hbs.html', 'posts-sans.json' ], jsRollupTask);
  watch('posts/*/*.{jpeg,jpg,png,gif}', images);

  var forever = require('forever');
  var srv = new forever.Monitor('server.js');
  srv.start();
  forever.startServer(srv);
}

function server () {

  var forever = require('forever');
  var srv = new forever.Monitor('server.js');
  srv.start();
  forever.startServer(srv);

}

exports.watch = series(contentTask, watcher);
exports.uat = series(cleanTask, buildTask, server);

/** **************************************************************************************************************** **/

exports.default = series(devBuildTask, watcher);
