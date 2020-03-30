
const path = require('path');
const { without, omit } = require('lodash');
const { resolve, isCleanUrl, TYPE, ENGINE } = require('./resolve');
const Page = require('./page');
const slugs = require('slugify');
const slugify = (s) => slugs(s, { remove: /[*+~.,()'"!?:@/\\]/g }).toLowerCase();
const pkg  = require(resolve('package.json'));
const { isString } = require('./lib/util');
const { parseTweetId } = require('./page-tweets');

const POSTMATCH = /(\d{4}-\d\d-\d\d)\.\d{4}\.(\w+)/;

module.exports = exports = class Post extends Page {

  _engine () {
    switch (this.type) {
    case TYPE.HANDLEBARS:
      return TYPE.HANDLEBARS;
    case TYPE.MARKDOWN:
      return ENGINE.POST;
    default:
      return ENGINE.OTHER;
    }
  }

  _dir (dir) {
    // if the file name matches the POSTMATCH pattern, then this needs to be /p/ file
    const match = this.name.match(POSTMATCH);

    if (match) {
      return [ 'p', match[2] ];
    }

    dir = dir.replace(POSTMATCH, '$2').split('/');
    dir = without(dir, 'posts', '_images');
    dir.unshift('p');
    return dir;
  }

  _out () {
    var isIndexPage = (this.name === 'index' || this.name.match(POSTMATCH));
    var isClean = isCleanUrl(this.ext);

    if (isClean && isIndexPage) {
      this.out     = path.join(this.base, this.slug || '', 'index.html');
      this.json    = path.join(this.base, 'index.json');
      this.url     = path.join(this.dir, this.slug || '');
    } else if (isClean) {
      this.out     = path.join(this.base, this.name, 'index.html');
      this.json    = path.join(this.base, this.name + '.json');
      this.url     = path.join(this.dir, this.name);
    } else if (isIndexPage) {
      this.out     = path.join(this.base, 'index.html');
      this.json    = path.join(this.base, this.name + '.json');
      this.url     = this.dir;
    } else {
      this.out     = path.join(this.base, this.basename);
      this.json    = path.join(this.base, this.basename + '.json');
      this.url     = path.join(this.dir, this.basename);
    }

    this.subPage = !isIndexPage;

    const url = new URL(pkg.siteInfo.siteUrl);
    url.pathname = this.url;
    this.fullurl = url.href;
  }

  _parse (PostFiles) {
    const { titlecard, webready } = this.files = PostFiles.for(this.dir);
    this.ignore = this.meta.ignore;
    this.draft = this.meta.draft;
    this.siblings = this.meta.siblings;
    this.images = omit(webready, [ 'titlecard', 'poster' ]);
    this.imageCount = Object.keys(this.images).length;
    if (this.meta.tweet  && isString(this.meta.tweet))  this.meta.tweet  = this.meta.tweet.split(/\s/).filter(Boolean);
    if (this.meta.tweets && isString(this.meta.tweets)) this.meta.tweets = this.meta.tweets.split(/\s/).filter(Boolean);
    this.tweet  = (this.meta.tweet  || []).map(parseTweetId);
    this.tweets = (this.meta.tweets || []).map(parseTweetId);

    this.id = this.meta.id;
    this.slug = this.meta.slug || (this.meta.title && slugify(this.meta.title)) || false;

    var flags = new Set(this.meta.classes || []);
    flags.add('post');


    const poster = this.files._getPoster() || this.files._getFirst();
    this.poster = poster && poster.sizes || false;

    if (poster) {
      flags.add('has-poster');
    } else {
      flags.add('no-poster');
    }

    if (this.meta.orientation) {
      flags.add('is-' + this.meta.orientation);
    } else if (poster) {
      flags.add('is-' + poster.dimensions.orientation);
    }

    if (titlecard) {
      this.titlecard = titlecard;
    } else if (poster) {
      if (!this._tasks) this._tasks = [];
      this.titlecard = path.join(this.dir, 'titlecard.jpeg');

      switch (this.meta.titlecard) {
      case 'top':
      case 'north':
        this._tasks.push(poster.titlecardTask('north'));
        break;
      case 'bottom':
      case 'south':
        this._tasks.push(poster.titlecardTask('south'));
        break;
      case 'center':
      case 'middle':
        this._tasks.push(poster.titlecardTask('center'));
        break;
      case 'box':
        this._tasks.push(poster.titlecardTask('box'));
        break;
      case 'thumb':
      case 'square':
      default:
        this._tasks.push(poster.titlecardTask('square'));
        break;
      }
    }

    this.meta.tags = (this.meta.tags || []).reduce((result, tag) => {
      result[slugify(tag)] = tag;
      return result;
    }, {});


    if (Object.keys(this.meta.tags).length === 1 && this.meta.tags.ootd) {
      flags.add('is-ootd-only');
    } else {
      flags.add('not-ootd-only');
    }

    if (this.meta.tweet) {
      flags.add('has-tweet');
    }

    if (this.images && Object.keys(this.images).length) {
      flags.add('has-images');
      if (this.meta['no-images']) {
        flags.add('hide-images');
      } else {
        flags.add('show-images');
      }

      if (this.imageCount === 1 && !this.meta['no-single']) {
        flags.add('single-image');
      }
    } else {
      flags.add('no-images');
      flags.add('hide-images');
    }

    if (this.meta['no-title']) {
      flags.add('hide-title');
    } else if (this.meta.title || this.meta.description) {
      flags.add('show-title');
    } else {
      flags.add('hide-title');
    }

    if (this.meta.title) {
      flags.add('has-title');
    } else {
      flags.add('no-title');
    }

    if (this.meta.subtitle) {
      flags.add('has-subtitle');
    } else {
      flags.add('no-subtitle');
    }

    if (this.meta.description) {
      flags.add('has-descrip');
    } else {
      flags.add('no-descrip');
    }

    if (this.source.trim()) {
      flags.add('has-body');
    } else {
      flags.add('no-body');
    }

    if (this.meta.tweets) {
      flags.add('has-tweets');
    } else {
      flags.add('no-tweets');
    }

    this.classes = Array.from(flags);
    this.flags = this.classes.reduce((res, item) => {
      var camelCased = item.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
      res[camelCased] = true;
      return res;
    }, {});

    this._out();
  }

};

