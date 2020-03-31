const path = require('path');
const glob = require('./lib/glob');
const { ROOT, KIND, ENGINE, TYPE } = require('./resolve');
const { without, omit } = require('lodash');
const Asset = require('./asset');
const Page = require('./page');
const Files = require('./files');

class ListFiles extends Files {
  _kindMap () {
    return {
      [KIND.PAGE]:  List,
      [KIND.ASSET]: ListAsset,
    };
  }
}

module.exports = exports = async function loadListFiles () {
  return new ListFiles(await glob('lists/**/*', { cwd: ROOT, nodir: true }));
};

class ListAsset extends Asset {

  _dir (dir) {
    dir = dir.split('/');
    dir = without(dir, 'lists', '_images');
    dir.unshift('l');
    return dir;
  }

}

class List extends Page {

  constructor (filepath) {
    super(filepath);

    this.serializable.push(
      'posts',
    );
  }

  _engine () {
    switch (this.type) {
    case TYPE.HANDLEBARS:
      return TYPE.HANDLEBARS;
    case TYPE.MARKDOWN:
      return ENGINE.LIST;
    default:
      return ENGINE.OTHER;
    }
  }

  _dir (dir) {
    dir = dir.split('/');
    dir = without(dir, 'lists', '_images');
    dir.unshift('l');
    return dir;
  }

  _parse (FileTree) {
    const { titlecard, webready } = this.files = FileTree.for(this.dir);
    this.ignore = this.meta.ignore;
    this.draft = this.meta.draft;
    this.siblings = this.meta.siblings;
    this.images = omit(webready, [ 'titlecard', 'poster' ]);
    this.imageCount = Object.keys(this.images).length;

    this.id = this.meta.id;

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

    this.classes = Array.from(flags);
    this.flags = this.classes.reduce((res, item) => {
      var camelCased = item.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
      res[camelCased] = true;
      return res;
    }, {});
  }

  importPosts (posts) {
    this.posts = this.meta.posts.map((id) => posts[id]).filter(Boolean);
  }
}
