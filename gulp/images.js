
const argv = require('minimist')(process.argv.slice(2));
const path          = require('path');
const resizer       = require('gulp-image-resize');
const merge         = require('merge-stream');
const rename        = require('gulp-rename');
const filter        = require('./lib/filter');
const { src, dest } = require('gulp');
const rev           = require('gulp-rev');
const asyncthrough  = require('./lib/through');
const buildsaver    = require('./lib/buildsaver');
const parallelize   = require('concurrent-transform');
const clone         = require('gulp-clone');
const dedupe        = require('./lib/dedupe');
const sort          = require('./lib/sort');
const changed       = require('gulp-changed');

const ROOT = path.dirname(__dirname);
const DEST = 'docs';
const OUTPUT = `${DEST}/p/`;

module.exports = exports = function imageScale (noskip) {
  const log = argv.verbose ? true : { new: true, build: true, update: true };
  var bs = buildsaver({ skip: !noskip, rev: noskip, log });

  var images = src('posts/*/*.{jpeg,jpg,png,gif,m4v}', { read: true })
    .pipe(rename((file) => {
      const hash = file.dirname.split('.')[2];
      file.dirname = hash;
    }))
  ;

  var fullsize = images
    .pipe(filter(/\/\d?\d?\d(?:-\d?\d)?.(?:jpe?g|png|gif)$/))
    .pipe(clone())
    .pipe(changed(OUTPUT, { extension: '.jpeg' }))
    .pipe(bs.source())
    .pipe(parallelize(resizer({
      format: 'jpeg',
      width: 1000,
      crop: false,
    })), 10);

  var halfsize = images
    .pipe(filter(/\/\d?\d?\d-\d?\d.(?:jpe?g|png|gif)$/))
    .pipe(clone())
    .pipe(rename((file) => {
      file.basename += '.sm';
    }))
    .pipe(changed(OUTPUT, { extension: '.jpeg' }))
    .pipe(bs.source())
    .pipe(parallelize(resizer({
      format: 'jpeg',
      width: 500,
      crop: false,
    })), 10)
  ;

  const WIDTH = 1000;
  const TITLECARD_WIDTH = 1200;
  const TITLECARD_HEIGHT = Math.ceil(TITLECARD_WIDTH / 1.905);

  var posters = images.pipe(filter(/\/poster.(?:jpe?g|png|gif)$/))
    .pipe(clone())
    .pipe(changed(OUTPUT, { extension: '.jpeg' }))
    .pipe(bs.source())
    .pipe(parallelize(resizer({
      format: 'jpeg',
      width: WIDTH,
      crop: false,
    })), 10);


  var titlecardSource = images.pipe(filter(/\/(?:poster|0?0?1(?:-0?1)?).(?:jpeg|jpg|png|gif)$/))
    .pipe(sort([
      (file) => (file.path.replace(/\/[^/]*$/)),
      (file) => (file.path.match(/\/poster.(?:jpe?g|png|gif)$/) ? 1 : 2),
    ]))
    .pipe(dedupe({
      replace: /\/[^/]*$/,
      log: false,
    }))
  ;

  var titlecardNorth = titlecardSource
    .pipe(clone())
    .pipe(rename((file) => {
      file.basename = 'titlecard-north';
    }))
    .pipe(changed(OUTPUT, { extension: '.jpeg' }))
    .pipe(bs.source())
    .pipe(parallelize(resizer({
      format: 'png',
      width: TITLECARD_WIDTH,
      height: TITLECARD_HEIGHT,
      gravity: 'North',
      crop: true,
    })), 10)
  ;

  var titlecardSouth = titlecardSource
    .pipe(clone())
    .pipe(rename((file) => {
      file.basename = 'titlecard-south';
    }))
    .pipe(changed(OUTPUT, { extension: '.jpeg' }))
    .pipe(bs.source())
    .pipe(parallelize(resizer({
      format: 'png',
      width: TITLECARD_WIDTH,
      height: TITLECARD_HEIGHT,
      gravity: 'South',
      crop: true,
    })), 10)
  ;

  var titlecardCenter = titlecardSource
    .pipe(clone())
    .pipe(rename((file) => {
      file.basename = 'titlecard-center';
    }))
    .pipe(changed(OUTPUT, { extension: '.jpeg' }))
    .pipe(bs.source())
    .pipe(parallelize(resizer({
      format: 'png',
      width: TITLECARD_WIDTH,
      height: TITLECARD_HEIGHT,
      gravity: 'Center',
      crop: true,
    })), 10)
  ;

  var thumbnail = titlecardSource
    .pipe(clone())
    .pipe(rename((file) => {
      file.basename = 'titlecard-thumb';
    }))
    .pipe(changed(OUTPUT, { extension: '.jpeg' }))
    .pipe(bs.source())
    .pipe(parallelize(resizer({
      format: 'png',
      width: 400,
      height: 400,
      crop: true,
    })), 10)
  ;

  var other = images
    .pipe(filter.not(/\/(?:\d?\d?\d(?:-\d?\d)?|poster|titlecard)\.(?:jpe?g|png|gif)$/))
    .pipe(changed(OUTPUT));

  return merge(
    fullsize
    , halfsize
    , posters
    , titlecardNorth
    , titlecardCenter
    , titlecardSouth
    , thumbnail
    , other
  )
    // .pipe(require('./lib/debug')())
    .pipe(bs.cache())
    .pipe(dest(OUTPUT))
    .pipe(bs.finish())
  ;
};

exports.prod = function imageScaleForProd () {
  return exports(true)
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
