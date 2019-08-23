
const path          = require('path');
const { src, dest } = require('gulp');
const rev           = require('gulp-rev');
const asyncthrough  = require('./lib/through');
const changed       = require('gulp-changed');

const ROOT = path.dirname(__dirname);
const DEST = 'docs';

module.exports = exports = function fileCopy () {
  return src('files/**/*')
    .pipe(changed(DEST))
    .pipe(dest(DEST))
  ;
};

exports.prod = function fileCopyForProd () {
  return exports()
    .pipe(rev())
    .pipe(dest(DEST))
    .pipe(asyncthrough(async (stream, file) => {
      // Change rev's original base path back to the public root so that it uses the full
      // path as the original file name key in the manifest
      var base = path.resolve(ROOT, DEST);
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

exports.copyCache = function copyImagesFromCache () {
  return src('bs-cache/p/**/*')
    .pipe(changed(`${DEST}/p`))
    .pipe(dest(`${DEST}/p`))
  ;
};

