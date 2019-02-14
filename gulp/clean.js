
const { src } = require('gulp');
const clean   = require('gulp-clean');

module.exports = exports = function cleanDistribution () {
  return src([ 'docs', 'rev-manifest.json' ], { read: false, allowEmpty: true })
    .pipe(clean());
};

exports.cache = function cleanCache () {
  return src([ 'bs-cache' ], { read: false, allowEmpty: true })
    .pipe(clean());
};
