
const argv = require('minimist')(process.argv.slice(2));
const path          = require('path');
// const resizer       = require('gulp-image-resize');
const merge         = require('merge-stream');
// const rename        = require('gulp-rename');
const { src, dest } = require('gulp');
const glob = require('./lib/glob');
// const rev           = require('gulp-rev');
// const asyncthrough  = require('./lib/through');
// const buildsaver    = require('./lib/buildsaver');
const spritesmith    = require('gulp.spritesmith');

module.exports = exports = async function sprite () {

  const target = argv.target;

  const postHash = path.dirname(target);
  const postPath = (await glob('posts/*.' + postHash + '/'))[0];

  if (!postPath) throw new Error('Post path does not exist: posts/*.' + postHash + '/');

  const imageNum = path.basename(target);

  const imgName = imageNum + '.jpg';
  const cssName = imageNum + '.json';

  const sprites = src(path.resolve(postPath, imageNum) + '-{1..9}.{jpeg,jpg,png,gif}')
    .pipe(spritesmith({
      imgName,
      cssName,
      padding: 10,
      algorithm: 'left-right',
    }));

  return merge(sprites.img, sprites.css)
    .pipe(dest(postPath));
};

