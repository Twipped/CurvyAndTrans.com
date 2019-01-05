
const { series, parallel, watch } = require('gulp');

/** **************************************************************************************************************** **/

var { loadLayout, posts, pages } = require('./contents');
var contentTask = series( loadLayout, posts, pages );
exports.content = contentTask;

var imagesTask = require('./images');
exports.images = imagesTask;

var scssTask = require('./scss');
exports.scss = scssTask;

var cleanTask = require('./clean');
exports.clean = cleanTask;

/** **************************************************************************************************************** **/


var buildTask = parallel(
  contentTask,
  imagesTask,
  scssTask
);
exports.build = buildTask;

exports.images = imagesTask;
exports.new = require('./new');
exports.publish = require('./publish');

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

exports.default = series(cleanTask, buildTask, watcher);
