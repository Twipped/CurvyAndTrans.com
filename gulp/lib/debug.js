
const through = require('./through');
const log = require('fancy-log');
const { get } = require('lodash');

module.exports = exports = function debug (targets) {
  return through(async (stream, file) => {
    var data;
    if (Array.isArray(targets)) {
      data = targets.reduce((result, target) => {
        result[target] = get(file, target);
        return result;
      }, {});
    } else if (targets) {
      data = get(file, targets);
    } else {
      data = { ...file, path: file.path, relative: file.relative, base: file.base };
    }
    log(data);
    stream.push(file);
  });
};

