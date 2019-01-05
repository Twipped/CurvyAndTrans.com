
const path = require('path');
const resizer     = require('gulp-image-resize');
const merge       = require('merge-stream');
const rename      = require('gulp-rename');
const { src, dest } = require('gulp');

const ROOT = path.dirname(__dirname);
const DEST = 'docs';

module.exports = exports = function imageScale () {
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
    '!posts/**/{1..9}.{jpeg,jpg,png,gif}',
  ]);

  return merge(fullsize, posters, titlecardNorth, titlecardCenter, thumbnail, other)
    .pipe(rename((file) => {
      const hash = file.dirname.split('.')[2];
      file.dirname = hash;
    }))
    .pipe(dest(`${DEST}/p/`));
};
