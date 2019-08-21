const through = require('./through');
const path = require('path');
const log = require('fancy-log');

function destil (input, patterns) {
  if (!patterns) return input;
  if (!Array.isArray(patterns)) patterns = [ patterns ];
  for (const p of patterns) {
    if (typeof p === 'function') {
      input = p(input);
    } else {
      input = input.replace(p, '');
    }
  }

  return input;
}

function relPath (base, filePath) {
  filePath = filePath.replace(/\\/g, '/');
  base = base.replace(/\\/g, '/');

  if (!filePath.startsWith(base)) {
    return filePath;
  }

  const newPath = filePath.slice(base.length);

  if (newPath[0] === '/') {
    return newPath.slice(1);
  }

  return newPath;
}

module.exports = exports = function (options) {
  var spotted = new Set();

  options = {
    replace: null, // Regular expressions to match against in the path and remove
    log: false,
    ...options,
  };

  if (options.log === true) {
    options.log = {
      'new':    true,
      'skip':   true,
    };
  } else if (!options.log) {
    options.log = {
      'new':    false,
      'skip':   false,
    };
  }

  return through(async (stream, file) => {
    if (file.isNull()) return;

    var fullpath = relPath(file.cwd, file.path);
    var matchpath = destil(fullpath, options.replace);

    if (spotted.has(matchpath)) {
      if (options.log.skip) log(`[skip] ${fullpath} (${matchpath})`);
      return;
    }

    if (options.log.new) log(`[new ] ${fullpath} (${matchpath})`);
    spotted.add(matchpath);

    stream.push(file);
  });

};
