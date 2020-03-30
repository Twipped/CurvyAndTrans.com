
const { src } = require('gulp');
const clean   = require('gulp-clean');

module.exports = exports = function cleanDistribution () {
  return src([ 'dist', 'rev-manifest.json', 'posts.json', 'pages.json', 'assets.json', 'twitter-media.json' ], { read: false, allowEmpty: true })
    .pipe(clean());
};

exports.dev = function cleanDistributionForDev () {
  return src([ 'dist/**.{js|json|jsx}', 'rev-manifest.json', 'posts.json', 'pages.json', 'assets.json', 'twitter-media.json' ], { read: false, allowEmpty: true })
    .pipe(clean());
};
