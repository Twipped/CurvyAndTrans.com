
const path          = require('path');
const { src, dest } = require('gulp');
const uglify        = require('gulp-uglify');
const rev           = require('gulp-rev');
const asyncthrough  = require('./lib/through');


const ROOT = path.dirname(__dirname);
const DEST = 'docs/js';

module.exports = exports = function buildScss () {
  return src('js/*.js')
    .pipe(dest(DEST));
};

exports.prod = function buildScssForProd () {
  return src('js/*.js')
    .pipe(uglify())
    .pipe(dest(DEST))
    .pipe(rev())
    .pipe(dest(DEST))
    .pipe(asyncthrough(async (stream, file) => {
      // Change rev's original base path back to the public root so that it uses the full
      // path as the original file name key in the manifest
      var base = path.resolve(ROOT, 'docs');
      file.revOrigBase = base;
      file.base = base;

      stream.push(file);
    }))
    .pipe(rev.manifest({
      merge: true, // Merge with the existing manifest if one exists
    }))
    .pipe(dest('.'))
  ;
};
