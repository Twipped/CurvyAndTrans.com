const path = require('path');
const fs = require('fs-extra');
const gm = require('gm');
const Promise = require('bluebird');

const CWD = path.resolve(__dirname, '../..');

const MAX_WIDTH = 2048;
const LG_WIDTH = 1024;
const MD_WIDTH = 768;
const SM_WIDTH = 576;
const XS_WIDTH = 300;

const THUMB_WIDTH = 100;
const TITLECARD_WIDTH = 1200;
const TITLECARD_HEIGHT = Math.ceil(TITLECARD_WIDTH / 1.905);
const TITLECARD_SQUARE = 400;
const CAROUSEL_HEIGHT = 400;

const actions = {
  async copy ({ input, output }) {
    await fs.copy(input, output);
    return fs.readFile(input);
  },

  async carousel1x ({ input, output, cache }) {
    const result = await actions.image({
      input,
      output,
      format: 'jpeg',
      height: CAROUSEL_HEIGHT,
      fill: 'contain',
      quality: 85,
    });
    await fs.writeFile(cache, result);
    return result;
  },

  async carousel2x ({ input, output, cache }) {
    const result = await actions.image({
      input,
      output,
      format: 'jpeg',
      height: CAROUSEL_HEIGHT * 2,
      fill: 'contain',
      quality: 85,
    });
    await fs.writeFile(cache, result);
    return result;
  },

  async max ({ input, output, cache }) {
    const result = await actions.image({
      input,
      output,
      format: 'jpeg',
      width: MAX_WIDTH,
      fill: 'contain',
      quality: 95,
    });
    await fs.writeFile(cache, result);
    return result;
  },

  async lg ({ input, output, cache }) {
    const result = await actions.image({
      input,
      output,
      format: 'jpeg',
      width: LG_WIDTH,
      fill: 'contain',
      quality: 85,
    });
    await fs.writeFile(cache, result);
    return result;
  },

  async md ({ input, output, cache }) {
    const result = await actions.image({
      input,
      output,
      format: 'jpeg',
      width: MD_WIDTH,
      fill: 'contain',
      quality: 75,
    });
    await fs.writeFile(cache, result);
    return result;
  },

  async sm ({ input, output, cache }) {
    const result = await actions.image({
      input,
      output,
      format: 'jpeg',
      width: SM_WIDTH,
      crop: false,
      fill: 'contain',
      quality: 75,
    });
    await fs.writeFile(cache, result);
    return result;
  },

  async xs ({ input, output, cache }) {
    const result = await actions.image({
      input,
      output,
      format: 'jpeg',
      width: XS_WIDTH,
      crop: false,
      fill: 'contain',
      quality: 75,
    });
    await fs.writeFile(cache, result);
    return result;
  },

  async thumb ({ input, output, cache }) {
    const result = await actions.image({
      input,
      output,
      format: 'jpeg',
      width: THUMB_WIDTH,
      fill: 'contain',
      quality: 75,
    });
    await fs.writeFile(cache, result);
    return result;
  },

  async tcNorth ({ input, output, cache }) {
    const result = await actions.image({
      input,
      output,
      format: 'jpeg',
      width: TITLECARD_WIDTH,
      height: TITLECARD_HEIGHT,
      gravity: 'North',
      fill: 'crop',
      quality: 75,
    });
    await fs.writeFile(cache, result);
    return result;
  },

  async tcSouth ({ input, output, cache }) {
    const result = await actions.image({
      input,
      output,
      format: 'jpeg',
      width: TITLECARD_WIDTH,
      height: TITLECARD_HEIGHT,
      gravity: 'South',
      fill: 'crop',
      quality: 75,
    });
    await fs.writeFile(cache, result);
    return result;
  },

  async tcCenter ({ input, output, cache }) {
    const result = await actions.image({
      input,
      output,
      format: 'jpeg',
      width: TITLECARD_WIDTH,
      height: TITLECARD_HEIGHT,
      gravity: 'Center',
      fill: 'crop',
      quality: 75,
    });
    await fs.writeFile(cache, result);
    return result;
  },

  async tcSquare ({ input, output, cache }) {
    const result = await actions.image({
      input,
      output,
      format: 'jpeg',
      width: TITLECARD_SQUARE,
      height: TITLECARD_SQUARE,
      fill: 'crop',
      gravity: 'Center',
      quality: 75,
    });
    await fs.writeFile(cache, result);
    return result;
  },

  async transcode ({ input, output, cache }) {
    const result = await actions.image({
      input,
      output,
      format: 'jpeg',
    });
    await fs.writeFile(cache, result);
    return result;
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

      if (options.fill === 'crop') {
        gmfile = gmfile
          .geometry(options.width, options.height, '^')
          .gravity(options.gravity)
          .crop(options.width, options.height);
      } else if (options.fill === 'cover') {
        gmfile = gmfile
          .geometry(options.width, options.height, '^');
      } else if (options.fill === 'contain') {
        gmfile = gmfile
          .geometry(options.width, options.height);
      } else {
        gmfile = gmfile
          .geometry(options.width, options.height, '!');
      }

    } else if (options.percentage) {
      gmfile = gmfile
        .geometry(options.percentage, null, '%');
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

    const result = await Promise.fromCallback((cb) => gmfile.tpBuffer(cb));
    await fs.writeFile(output, result);

    return result;
  },
};

module.exports = exports = actions;
