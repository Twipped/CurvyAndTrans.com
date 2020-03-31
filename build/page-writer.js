const path = require('path');
const Promise = require('bluebird');
const fs = require('fs-extra');
const { resolve, ROOT, TYPE } = require('./resolve');
const { siteInfo }  = require(resolve('package.json'));
const { attachTweets } = require('./page-tweets');
const { minify } = require('html-minifier-terser');

const MINIFY_CONFIG = {
  conservativeCollapse: true,
  collapseWhitespace: true,
  minifyCSS: true,
  removeComments: true,
  removeRedundantAttributes: true,
};

module.exports = exports = async function writePageContent (prod, engines, pages, posts, lists) {
  const postIndex = index(posts, engines);
  const postMap = Object.fromEntries(postIndex.posts.map((post) => [ post.id, post ]));
  lists.forEach((l) => l.importPosts(postMap));

  const listIndex = index(lists, engines);
  postIndex.lists = listIndex.posts;
  postIndex.drafts.push(listIndex.drafts);
  await processPages(engines, [ ...posts, ...pages, ...lists ], postIndex, prod);
  return postIndex;
};

function index (posts, engines) {
  const drafts = posts.filter((p) => p.draft && !p.subPage);
  posts = posts.filter((p) => !p.draft && !p.subPage);

  siblings(posts);

  // fill in post content
  posts.forEach((p) => {
    if (p.type === TYPE.MARKDOWN) {
      p.preview = engines.preview(p.source, pageState(p));
      p.classes.push(p.preview.trim() ? 'has-preview' : 'no-preview');
      p.flags[ p.preview.trim() ? 'has-preview' : 'no-preview' ] = true;
    }
    p.content = engines[p.type](p.source, pageState(p));
  });
  drafts.forEach((p) => {
    if (p.type === TYPE.MARKDOWN) {
      p.preview = engines.preview(p.source, pageState(p));
      p.classes.push(p.preview.trim() ? 'has-preview' : 'no-preview');
      p.flags[ p.preview.trim() ? 'has-preview' : 'no-preview' ] = true;
    }
    p.content = engines[p.type](p.source, pageState(p));
  });

  const reducedPosts = posts.map(pageJSON);

  const tagMap = reducedPosts.reduce((o, p) => Object.assign(o, p.tags), {});
  const tags = Object.keys(tagMap).sort().reduce((result, tagslug) => {
    result[tagslug] = tagMap[tagslug];
    return result;
  }, {});

  return {
    posts: reducedPosts,
    drafts: drafts.map(pageJSON),
    tags,
  };
}

function siblings (posts) {
  let first, prev, next, last;
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    first = i > 0 && posts[0];
    prev = posts[i - 1] || false;
    next = posts[i + 1] || false;
    last = i < posts.length - 1 && posts[posts.length - 1];

    post.siblings = {
      first: first && first.url,
      prev: prev && prev.url,
      next: next && next.url,
      last: last && last.url,
    };
  }
}

function pageState (page, posts) {
  return {
    ...page,
    meta: { ...page.meta, ...page },
    page: {
      domain: siteInfo.domain,
      title: page.meta.title
        ? (page.meta.title + (page.meta.subtitle ? ', ' + page.meta.subtitle : '') + ' :: ' + siteInfo.title)
        : siteInfo.title,
      description: page.meta.description || siteInfo.description,
    },
    site: siteInfo,
    local: {
      cwd: resolve(page.cwd),
      root: ROOT,
      basename: page.basename,
    },
    posts,
  };
}

function pageJSON (post) {
  return {
    id: post.id,
    url: post.url,
    fullurl: post.fullurl,
    json: '/' + post.json,
    title: post.meta.title,
    subtitle: post.meta.subtitle,
    description: post.meta.description,
    preview: post.preview,
    date: post.dateCreated,
    modified: post.dateModified,
    titlecard: post.titlecard,
    tags: post.meta.tags,
    flags: post.flags,
    classes: post.classes,
    poster: post.poster,
    tweet: post.tweet,
    tweets: post.tweets && attachTweets(post.tweet, post.tweets),
  };
}

function processPages (engines, pages, posts, prod) {
  const shrink = (input) => (prod ? minify(input, MINIFY_CONFIG) : input);

  return Promise.map(pages, async (page) => {

    const state = pageState(page.toJson(), posts);
    const json = pageJSON(page);

    try {
      var html = String(engines[page.engine](page.source, state));
    } catch (e) {
      e.message = `Error while processing page "${page.input}": ${e.message}`;
      throw e;
    }

    try {
      html = shrink(html);
    } catch (e) {
      e.message = `Error while minifying page "${page.input}": ${e.message.slice(0, 50)}`;
      throw e;
    }

    json.content = page.content;

    const output = resolve('dist', page.out);
    await fs.ensureDir(path.dirname(output));
    await Promise.all([
      fs.writeFile(output, Buffer.from(html)),
      page.json && fs.writeFile(resolve('dist', page.json), Buffer.from(
        prod ? JSON.stringify(json) : JSON.stringify(json, null, 2),
      )),
    ]);
  });
}
