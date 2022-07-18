
const path = require('path');
const { pick, each } = require('lodash');
const actions = require('./actions');
const File = require('./file');
const { TYPE } = require('./resolve');
const getImageDimensions = require('./lib/dimensions');
const getVideoDimensions = require('get-video-dimensions');

const TITLECARD_WIDTH = 1200;
const TITLECARD_HEIGHT = Math.ceil(TITLECARD_WIDTH / 1.905);
const TITLECARD_SQUARE = 400;
const CAROUSEL_HEIGHT = 400;
const WIDTHS = [ 2048, 1024, 768, 576, 300, 100 ];
const CAROUSELS = {
  'pre1x':  {
    height: CAROUSEL_HEIGHT,
  },
  'pre2x':  {
    height: CAROUSEL_HEIGHT * 2,
  },
};
const TITLECARDS = {
  'north':  {
    width: TITLECARD_WIDTH,
    height: TITLECARD_HEIGHT,
    gravity: 'North',
    fill: 'crop',
  },
  'south':  {
    width: TITLECARD_WIDTH,
    height: TITLECARD_HEIGHT,
    gravity: 'South',
    fill: 'crop',
  },
  'center': {
    width: TITLECARD_WIDTH,
    height: TITLECARD_HEIGHT,
    gravity: 'Center',
    fill: 'crop',
  },
  'square': {
    width: TITLECARD_SQUARE,
    height: TITLECARD_SQUARE,
    fill: 'crop',
    gravity: 'Center',
  },
  'box':    {
    width: TITLECARD_SQUARE,
    height: TITLECARD_SQUARE,
    fill: 'box',
    gravity: 'Center',
  },
};
const SERIAL_PATTERN = /^\d+(?:-\d+)?$/;


module.exports = exports = class Asset extends File {

  constructor (filepath) {
    super(filepath);

    this.serializable.push(
      'dimensions',
      'sizes',
    );
  }

  load () {
    this.isSerial = !!this.name.match(SERIAL_PATTERN);

    switch (this.type) {
    case TYPE.VIDEO: return this.loadVideo();
    case TYPE.IMAGE: return this.loadImage();
    default:
      return this.loadOther();
    }
  }

  async loadImage () {

    const { width, height } = await getImageDimensions(this.input);

    const ratioH = Math.round((height / width) * 100);
    const ratioW = Math.round((width / height) * 100);
    let orientation = 'wide';
    if (ratioH > 100) {
      orientation = 'tall';
    } else if (ratioH === 100) {
      orientation = 'square';
    }

    this.dimensions = {
      width,
      height,
      ratioH,
      ratioW,
      orientation,
    };

    this.sizes = [ {
      url: this.url,
      width,
      height,
    } ];

    if (this.preprocessed || this.ext === '.svg') {
      this._tasks = [ {
        output: this.out,
        input: this.input,
        action: actions.copy,
        nocache: true,
      } ];
      return;
    }

    this._tasks = [
      {
        output: this.out,
        input: this.input,
        width,
        height,
        format: 'jpeg',
        action: actions.image,
      },
    ];

    for (const w of WIDTHS) {
      if (w > width) continue;
      const name = `${this.name}.${w}w${this.ext}`;
      this.sizes.push({
        url:    path.join(this.dir,  name),
        width:  w,
        height: Math.ceil((w / width) * height),
      });
      this._tasks.push({
        output: path.join(this.base, name),
        input: this.input,
        width: w,
        format: 'jpeg',
        fill: 'contain',
        quality: 85,
        action: actions.image,
      });
    }

    if (this.isSerial) {
      this.carousel = {};
      this.carousel.full = {
        url: this.url,
        width,
        height,
      };
      each(WIDTHS, (w) => {
        if (w > width) return;
        const name = `${this.name}.${w}w${this.ext}`;
        this.carousel[w + 'w'] = {
          url:    path.join(this.dir,  name),
          width:  w,
          height: Math.ceil((w / width) * height),
        };
      });
      each(CAROUSELS, (attributes, k) => {
        const name = `${this.name}.${k}${this.ext}`;
        this.carousel[k] = {
          url:    path.join(this.dir,  name),
          height: attributes.height,
          width:  Math.ceil((attributes.height / height) * width),
        };

        this._tasks.push({
          output: path.join(this.base, name),
          input: this.input,
          fill: 'contain',
          quality: 85,
          format: 'jpeg',
          ...attributes,
          action: actions.image,
        });
      });
    }

    this.sizes.reverse();

    return this;
  }

  async loadVideo () {
    const { width, height } = await getVideoDimensions(this.input);

    const ratioH = Math.round((height / width) * 100);
    const ratioW = Math.round((width / height) * 100);
    let orientation = 'wide';
    if (ratioH > 100) {
      orientation = 'tall';
    } else if (ratioH === 100) {
      orientation = 'square';
    }

    this.dimensions = {
      width,
      height,
      ratioH,
      ratioW,
      orientation,
    };

    this.sizes = [ {
      url:    path.join(this.dir,  this.basename),
      width,
      height,
    } ];

    this._tasks = [
      {
        output: this.out,
        input: this.input,
        action: actions.copy,
        nocache: true,
      },
    ];

    return this;
  }

  async loadOther () {
    this.sizes = [];

    this._tasks = [
      {
        output: this.out,
        input: this.input,
        action: actions.copy,
        nocache: true,
      },
    ];
  }

  get webready () {
    const { type, name, url, sizes, carousel } = this;
    return {
      type,
      name,
      url,
      sizes: sizes.map((s) => pick(s, [ 'url', 'width', 'height' ])),
      carousel,
    };
  }

  tasks () {
    return this._tasks;
  }

  titlecardTask (direction) {
    return {
      input: this.input,
      output: path.join(this.base, 'titlecard.jpeg'),
      fill: 'crop',
      quality: 85,
      format: 'jpeg',
      ...TITLECARDS[direction],
      action: actions.image,
    };
  }

};
