
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

var cleanTask = require('./clean');
exports.clean = cleanTask;

const pushToProd = require('./publish');
exports.push = pushToProd;

/** **************************************************************************************************************** **/

exports.new = require('./new');

var buildTask = series(
  cleanTask,
  parallel(
    imagesTask.prod,
    scssTask.prod,
    filesTask.prod
  ),
  loadLayout.prod,
  posts,
  pages,
  rssTask
);

var devBuildTask = series(
  cleanTask,
  parallel(
    imagesTask,
    scssTask,
    filesTask
  ),
  loadLayout,
  posts,
  pages,
  rssTask
);

exports.dev = devBuildTask;
exports.build = buildTask;
exports.publish = series(
  buildTask,
  pushToProd
);
exports.testpush = pushToProd.dryrun;

/** **************************************************************************************************************** **/

function watcher () {

  watch([
    'posts/**/index.md',
    'posts/**/{1..9}.{jpeg,jpg,png,gif}',
    'templates/*.html',
    'pages/*',
    '!pages/*.md',
  ], contentTask);

  watch('scss/*.scss', scssTask);

  var forever = require('forever');
  var srv = new forever.Monitor('server.js');
  srv.start();
  forever.startServer(srv);

};

exports.watch = series(contentTask, watcher);

/** **************************************************************************************************************** **/

exports.default = series(devBuildTask, watcher);
