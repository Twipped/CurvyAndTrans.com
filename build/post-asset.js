
const { without } = require('lodash');
const Asset = require('./asset');

const POSTMATCH = /(\d{4}-\d\d-\d\d)\.\d{4}\.(\w+)/;

module.exports = exports = class PostAsset extends Asset {

  _dir (dir) {
    dir = dir.replace(POSTMATCH, '$2').split('/');
    dir = without(dir, 'posts', '_images');
    dir.unshift('p');
    return dir;
  }

};
