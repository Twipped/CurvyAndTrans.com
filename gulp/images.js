
const path          = require('path');
const resizer       = require('gulp-image-resize');
const merge         = require('merge-stream');
const rename        = require('gulp-rename');
const { src, dest } = require('gulp');
const rev           = require('gulp-rev');
const asyncthrough  = require('./lib/through');
const buildsaver    = require('./lib/buildsaver');
const parallelize   = require('concurrent-transform');

const ROOT = path.dirname(__dirname);
const DEST = 'docs';

module.exports = exports = function imageScale (noskip) {
  var bs = buildsaver({ skip: !noskip });

  var fullsize = src('posts/**/?({0..9}){0..9}.{jpeg,jpg,png,gif}')
    .pipe(bs.source())
    .pipe(parallelize(resizer({
      format: 'jpeg',
      width: 1000,
      crop: false,
    })), 10);

  var posters = src('posts/**/poster.{jpeg,jpg,png,gif}')
    .pipe(bs.source('poster'))
    .pipe(parallelize(resizer({
      format: 'jpeg',
      width: 1000,
      crop: false,
    })), 10);

  var titlecardNorth = src('posts/**/+(01|1).{jpeg,jpg,png,gif}')
    .pipe(bs.source('titlecard-north'))
    .pipe(parallelize(resizer({
      format: 'png',
      width: 1000,
      height: 525,
      gravity: 'North',
      crop: true,
    })), 10)
    .pipe(rename((file) => {
      file.basename = 'titlecard-north';
    }));

  var titlecardCenter = src('posts/**/+(01|1).{jpeg,jpg,png,gif}')
    .pipe(bs.source('titlecard-center'))
    .pipe(parallelize(resizer({
      format: 'png',
      width: 1000,
      height: 525,
      gravity: 'Center',
      crop: true,
    })), 10)
    .pipe(rename((file) => {
      file.basename = 'titlecard-center';
    }));

  var thumbnail = src('posts/**/+(01|1).{jpeg,jpg,png,gif}')
    .pipe(bs.source('titlecard-thumb'))
    .pipe(parallelize(resizer({
      format: 'png',
      width: 400,
      height: 400,
      crop: true,
    })), 10)
    .pipe(rename((file) => {
      file.basename = 'titlecard-thumb';
    }));

  var other = src([
    'posts/**/*.{jpeg,jpg,png,gif,m4v}',
    '!posts/**/poster.{jpeg,jpg,png,gif}',
    '!posts/**/?({0..9}){0..9}.{jpeg,jpg,png,gif}',
  ]);

  return merge(fullsize, posters, titlecardNorth, titlecardCenter, thumbnail, other)
    .pipe(rename((file) => {
      const hash = file.dirname.split('.')[2];
      file.dirname = hash;
    }))
    .pipe(bs.cache())
    .pipe(dest(`${DEST}/p/`))
    .pipe(bs.finish())
  ;
};

exports.prod = function imageScaleForProd () {
  return exports(true)
    .pipe(rev())
    .pipe(dest(`${DEST}/p/`))
    .pipe(asyncthrough(async (stream, file) => {
      // Change rev's original base path back to the public root so that it uses the full
      // path as the original file name key in the manifest
      var base = path.resolve(ROOT, DEST);
      file.revOrigBase = base;
      file.base = base;

      stream.push(file);
    }))
    .pipe(rev.manifest({
      // base: `${DEST}/p/`,
      merge: true, // Merge with the existing manifest if one exists
    }))
    .pipe(dest('.'))
  ;
};
