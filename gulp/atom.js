
const path = require('path');
const fs   = require('fs-extra');
const RSS  = require('rss');
const { groupBy } = require('lodash');

const ROOT = path.dirname(__dirname);
const DEST = './docs';

module.exports = exports = async function buildAtomFeed () {
  var postIndex;
  try {
    postIndex = JSON.parse(fs.readFileSync(path.join(DEST, 'posts.json')));
  } catch (e) {
    postIndex = [];
  }

  const byState = groupBy(postIndex, (p) => (p.draft ? 'draft' : 'final'));

  var feed = new RSS({
    title: 'Curvy & Trans',
    feed_url: 'https://curvyandtrans.com/atom.xml',
    site_url: 'https://curvyandtrans.com',
    image_url: 'https://curvyandtrans.com/images/avi.png',
  });

  byState.final.forEach((post) => {
    feed.item({
      title: post.title,
      date: post.date,
      description: post.content,
      url: 'https://curvyandtrans.com' + post.url,
    });
  });

  await fs.writeFile(path.resolve(DEST, 'atom.xml'), feed.xml());
};
