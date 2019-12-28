
const path = require('path');
const fs   = require('fs-extra');
const RSS  = require('rss');
const { groupBy } = require('lodash');

const ROOT = path.dirname(__dirname);
const DEST = './docs';
const { siteInfo } = require('../package.json');

module.exports = exports = async function buildAtomFeed () {
  var postIndex;
  try {
    postIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'posts.json')));
  } catch (e) {
    postIndex = [];
  }

  const byState = groupBy(postIndex, (p) => (p.draft ? 'draft' : 'final'));

  var feed = new RSS(siteInfo.rss);

  byState.final.forEach((post) => {
    const description = post.poster ? `<img src="${siteInfo.rss.site_url + post.poster.xs}"><br>${post.preview}` : post.preview;
    feed.item({
      title: post.title,
      date: post.date,
      description,
      url: post.fullurl,
      categories: Object.values(post.tags),
      guid: post.id,
      enclosure: post.poster && {
        url: siteInfo.rss.site_url + post.poster.xs,
      },
    });
  });

  await fs.writeFile(path.resolve(DEST, 'atom.xml'), feed.xml());
};
