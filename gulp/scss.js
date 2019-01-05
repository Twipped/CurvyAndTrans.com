
const log           = require('fancy-log');
const path          = require('path');
const merge         = require('merge-stream');
const { src, dest } = require('gulp');
const scss          = require('gulp-sass');
// const minifyCSS     = require('gulp-minify-css');


const ROOT = path.dirname(__dirname);
const DEST = 'docs';

module.exports = exports = function buildScss () {
  return src('scss/*.scss')
    .pipe(scss({
      includePaths: [ path.join(ROOT, 'node_modules') ],
    }).on('error', log.error))
    .pipe(dest(DEST));
};
