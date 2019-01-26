
const argv = require('minimist')(process.argv.slice(2));
const moment = require('moment');
const random = require('../lib/random');
const { stripIndent } = require('common-tags');
const path = require('path');
const fs = require('fs-extra');
const log = require('fancy-log');

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

  var contents = stripIndent`
    ---
    id: "${id}"
    date: "${date.toISOString()}"
    title: ""
    description: "Outfit of the Day for ${date.format('MMM Do, YYYY')}"
    tags:
      - OOTD
    products:
      "Description": https://www.amazon.com/exec/obidos/ASIN/A000000000/curvyandtrans-20
    ---

  `;

  await fs.writeFile(path.join(target, 'index.md'), contents);

  log('Created new post at posts/' + fname);
};
