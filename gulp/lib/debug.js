
const through = require('through2');
const log = require('fancy-log');

module.exports = exports = function debug () {
  return through.obj(function (file, end, next) {
    log({ ...file, path: file.path, relative: file.relative, base: file.base });
    this.push(file);
    next();
  });
};

