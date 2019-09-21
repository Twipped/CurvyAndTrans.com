const path = require('path');
const fs = require('fs-extra');
const gm = require('gm');
const Promise = require('bluebird');

const CWD = path.resolve(__dirname, '../..');

const FULL_WIDTH = 1000;
const SMALL_WIDTH = 500;
const THUMB_WIDTH = 100;
const TITLECARD_WIDTH = 1200;
const TITLECARD_HEIGHT = Math.ceil(TITLECARD_WIDTH / 1.905);
const TITLECARD_SQUARE = 400;

const actions = {
  async copy ({ input, output }) {
    return fs.copy(input, output);
  },

  async fullsize ({ input, output, cache }) {
    await actions.image({
      input,
      output,
      format: 'jpeg',
      width: FULL_WIDTH,
      crop: false,
      quality: 95,
    });
    await fs.copy(output, cache);
  },

  async halfsize ({ input, output, cache }) {
    await actions.image({
      input,
      output,
      format: 'jpeg',
      width: SMALL_WIDTH,
      crop: false,
      quality: 75,
    });
    await fs.copy(output, cache);
  },

  async thumb ({ input, output, cache }) {
    await actions.image({
      input,
      output,
      format: 'jpeg',
      width: THUMB_WIDTH,
      crop: false,
      quality: 75,
    });
    await fs.copy(output, cache);
  },

  async poster ({ input, output, cache }) {
    await actions.image({
      input,
      output,
      format: 'jpeg',
      width: SMALL_WIDTH,
      crop: false,
    });
    await fs.copy(output, cache);
  },

  async titlecardNorth ({ input, output, cache }) {
    await actions.image({
      input,
      output,
      format: 'png',
      width: TITLECARD_WIDTH,
      height: TITLECARD_HEIGHT,
      gravity: 'North',
      crop: true,
      quality: 75,
    });
    await fs.copy(output, cache);
  },

  async titlecardSouth ({ input, output, cache }) {
    await actions.image({
      input,
      output,
      format: 'png',
      width: TITLECARD_WIDTH,
      height: TITLECARD_HEIGHT,
      gravity: 'South',
      crop: true,
      quality: 75,
    });
    await fs.copy(output, cache);
  },

  async titlecardCenter ({ input, output, cache }) {
    await actions.image({
      input,
      output,
      format: 'png',
      width: TITLECARD_WIDTH,
      height: TITLECARD_HEIGHT,
      gravity: 'Center',
      crop: true,
      quality: 75,
    });
    await fs.copy(output, cache);
  },

  async titlecardSquare ({ input, output, cache }) {
    await actions.image({
      input,
      output,
      format: 'png',
      width: TITLECARD_SQUARE,
      height: TITLECARD_SQUARE,
      crop: true,
      quality: 75,
    });
    await fs.copy(output, cache);
  },

  async transcode ({ input, output, cache }) {
    await actions.image({
      input,
      output,
      format: 'jpeg',
    });
    await fs.copy(output, cache);
  },

  async image (options) {
    const input = path.resolve(CWD, options.input);
    const output = path.resolve(CWD, options.output);
    const contents = await fs.readFile(input);
    let gmfile = gm(contents, input);

    const size = await Promise.fromCallback((cb) => gmfile.size(cb));

    if (options.height || options.width) {

      // if upscale is not requested, restrict size
      if (!options.upscale) {
        if (!isNaN(options.width)) {
          options.width  = Math.min(options.width, size.width);
        }
        if (!isNaN(options.height)) {
          options.height = Math.min(options.height, size.height);
        }
      }

      // if one dimension is not set - we fill it proportionally
      if (!options.height) {
        if (options.crop) {
          options.height = size.height;
        } else {
          options.height = Math.ceil((options.width / size.width) * size.height);
        }
      }
      if (!options.width) {
        if (options.crop) {
          options.width = size.width;
        } else {
          options.width = Math.ceil((options.height / size.height) * size.width);
        }
      }

      if (options.crop) {
        gmfile = gmfile
          .resize(options.width, options.height, '^')
          .gravity(options.gravity)
          .crop(options.width, options.height);
      } else if (options.cover) {
        gmfile = gmfile
          .resize(options.width, options.height, '^');
      } else {
        gmfile = gmfile
          .resize(options.width, options.height);
      }

    } else if (options.percentage) {
      gmfile = gmfile
        .resize(options.percentage, null, '%');
    }

    if (options.format) {
      gmfile = gmfile
        .setFormat(options.format);
    }

    if (options.quality) {
      gmfile = gmfile.quality(Math.floor(options.quality));
    } else {
      gmfile = gmfile.quality(Math.floor(95));
    }


    if (options.samplingFactor) {
      gmfile = gmfile
        .samplingFactor(options.samplingFactor[0], options.samplingFactor[1]);
    }

    if (options.sharpen) {
      options.sharpen = (typeof options.sharpen === 'string') ?  options.sharpen : '1.5x1+0.7+0.02';
      gmfile = gmfile.unsharp(options.sharpen);
    }

    if (options.flatten) {
      gmfile = gmfile.flatten();
    }

    if (options.interlace) {
      gmfile = gmfile.interlace('Line');
    }

    if (options.background) {
      gmfile = gmfile.background(options.background);
    }

    if (options.noProfile) {
      gmfile = gmfile.noProfile();
    }

    await fs.ensureDir(path.dirname(output));
    await Promise.fromCallback((cb) => gmfile.write(output, cb));
  },
};

module.exports = exports = actions;
