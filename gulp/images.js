
const path          = require('path');
const { src, dest } = require('gulp');
const rev           = require('gulp-rev');
const asyncthrough  = require('./lib/through');

const ROOT = path.dirname(__dirname);
const DEST = 'docs';
const OUTPUT = `${DEST}/p/`;

exports.prod = function imageScaleForProd () {
  return src(path.join(OUTPUT, '**/*.{jpeg,jpg,png,gif}'))
    .pipe(rev())
    .pipe(dest(OUTPUT))
    .pipe(asyncthrough(async (stream, file) => {
      // Change rev's original base path back to the public root so that it uses the full
      // path as the original file name key in the manifest
      var base = path.resolve(ROOT, DEST);
      file.revOrigBase = base;
      file.base = base;

      stream.push(file);
    }))
    .pipe(rev.manifest({
      // base: OUTPUT,
      merge: true, // Merge with the existing manifest if one exists
    }))
    .pipe(dest('.'))
  ;
};
