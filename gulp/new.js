
const argv = require('minimist')(process.argv.slice(2));
const moment = require('moment');
const random = require('../lib/random');
const path = require('path');
const fs = require('fs-extra');
const log = require('fancy-log');
const template = require('./_template');

const ROOT = path.dirname(__dirname);

module.exports = exports = async function newPost () {
  var date = argv.date ? moment(argv.date) : moment();

  if (!date.hour()) {
    const now = moment();
    date.hour(now.hour());
    date.minute(now.minute());
  }

  var id = random.id().substr(-6).toUpperCase();
  var fname = date.format('YYYY-MM-DD.HHmm.') + id;

  var target = path.join(ROOT, 'posts', fname);

  await fs.ensureDir(target);

  var contents = template({ id, date });

  await fs.writeFile(path.join(target, 'index.md'), contents);

  log('Created new post at posts/' + fname);
};
