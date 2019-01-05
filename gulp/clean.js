
const path    = require('path');
const { src } = require('gulp');
const clean   = require('gulp-clean');

const ROOT = path.dirname(__dirname);
const DEST = 'docs';


module.exports = exports = function cleanDistribution () {
  return src(DEST, { read: false, allowEmpty: true })
    .pipe(clean());
};
