
const { series, parallel, watch } = require('gulp');

/** **************************************************************************************************************** **/

var { loadLayout, posts, pages } = require('./contents');
var contentTask = series( loadLayout, posts, pages );
exports.content = contentTask;

const rssTask = require('./atom');
exports.atom = rssTask;

var imagesTask = require('./images');
exports.images = imagesTask;

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

const pushToProd = require('./publish');
exports.push = pushToProd;

const cloudfront = require('./cloudfront');
exports.cloudfront = cloudfront;

/** **************************************************************************************************************** **/

exports.sprite = require('./sprite');
exports.new = require('./new');

var buildTask = series(
  imagesTask.prod,
  scssTask.prod,
  jsTask.prod,
  filesTask.prod,
  loadLayout.prod,
  posts,
  jsRollupTask.prod,
  loadLayout.prod,
  pages,
  rssTask
);

var devBuildTask = series(
  parallel(
    imagesTask,
    scssTask,
    jsTask,
    filesTask
  ),
  loadLayout,
  posts,
  jsRollupTask,
  pages,
  rssTask
);

exports.dev = devBuildTask;
exports.prod = buildTask;
exports.publish = series(
  cleanTask,
  buildTask,
  pushToProd
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
  ], contentTask);

  watch('scss/*.scss', scssTask);
  watch('js/*.js', jsTask);
  watch([ 'js-rollup/*.js', 'templates/cell.hbs.html' ], jsRollupTask);

  var forever = require('forever');
  var srv = new forever.Monitor('server.js');
  srv.start();
  forever.startServer(srv);

};

function server () {

  var forever = require('forever');
  var srv = new forever.Monitor('server.js');
  srv.start();
  forever.startServer(srv);

};

exports.watch = series(contentTask, watcher);
exports.uat = series(cleanTask, buildTask, server);

/** **************************************************************************************************************** **/

exports.default = series(devBuildTask, watcher);
