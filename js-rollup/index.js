
import Backbone from 'backbone';
import Handlebars from 'handlebars/dist/handlebars';
import postsJSON from '../posts-sans.json';
import htmlCell from '../templates/cell.hbs.html';
import { find, without, groupBy, reduce, debounce } from 'lodash';
import dateFormat from 'date-fns/format';
import hhFirst from 'helper-hoard/src/helpers/collection/first';

const cell = Handlebars.compile(htmlCell);
Handlebars.registerPartial('cell', cell);

Handlebars.registerHelper('rev', (url) => (url[0] === '/' ? url : '/' + url));
Handlebars.registerHelper('date', (format, date) => dateFormat(date, format));
Handlebars.registerHelper('first', hhFirst.first(Handlebars));

const IndexView = Backbone.View.extend({
  el: '#body',
  template: Handlebars.compile(`
    <h3 class="tagged-header">
      <span>Latest Posts</span>
      <button type="button" class="btn btn-primary btn-sm" data-toggle="drawer" href="#drawer"><i class="fas fa-tags"></i></button>
    </h3>
    <div class="post-grid">
      {{#with posts.first}}
        {{> cell prime=true}}
      {{/with}}
      {{#each posts.ordered}}
        {{> cell}}
      {{/each}}
    </div>
    {{#unless full}}
    <div class="load-more">
      <button class="btn btn-primary btn-info btn-lg js-load-more" type="button">Load More</button>
    </div>
    {{/unless}}
  `),

  initialize () {
    this.loaded = 14;
    this.step = 14;

    const byState = groupBy(postsJSON, (p) => (p.draft ? 'draft' : 'final'));
    const postIndex = postsJSON.filter((p) => !p.draft);
    const pinned = find(postIndex, 'pinned');
    const tagMap = {};
    const byTag = reduce(byState.final, (results, p) => {
      const tags = p.tags || [];
      Object.keys(tags).forEach((tag) => {
        if (!results[tag]) {
          tagMap[tag] = tags[tag];
          results[tag] = [];
        }
        results[tag].push(p);
      });
      return results;
    }, {});

    // generate a sorted tag map
    const tags = Object.keys(tagMap).sort().reduce((result, tagslug) => {
      result[tagslug] = tagMap[tagslug];
      return result;
    }, {});


    this.tags = tags;
    this.byTag = byTag;

    if (pinned) {
      this.first = pinned;
      this.posts = without(byState.final, pinned);
    } else {
      const [ first, ...ordered ] = byState.final;
      this.first = first;
      this.posts = ordered;
    }

    this.checkBottom = debounce(this.checkBottom, 100);

    if (window.location.hash) {
      this.tag = window.location.hash.slice(1);
    }

    this.render();

    this.bottomInView = false;
    $(window).on('resize scroll', () => {
      this.checkBottom();
    });
  },

  render () {
    var html;

    if (this.tag) {
      const posts = this.byTag[this.tag] || [];
      html = posts.map((p) => cell(p));
      html = `
        <h3 class="tagged-header">
          <span>${this.tags[this.tag]}</span>
          <button type="button" class="btn btn-primary btn-sm" data-toggle="drawer" href="#drawer"><i class="fas fa-tags"></i></button>
        </h3>
        <div class="post-grid">${html.join('')}</div>
      `;

      this.$el.html(html);
      return;
    }

    var data = {
      posts: {
        first: this.first,
        ordered: this.posts.slice(0, this.loaded),
      },
      full: this.loaded >= this.posts.length,
    };

    html = this.template(data);

    this.$el.html(html);

    this.checkBottom();
  },

  checkBottom () {
    const $button = this.$('.load-more');
    if (!$button.length) return;

    const $window = $(window);
    const bTop = $button.offset().top;
    const vBottom = $window.scrollTop() + $window.height();
    const inView = bTop < vBottom;

    if (inView && !this.bottomInView) this.onLoadMore();
    if (!inView && this.bottomInView) this.bottomInView = false;
  },

  onLoadMore () {
    if (this.loaded >= this.posts.length) return;
    this.loaded += this.step;
    this.render();
  },

  showTag (tag) {
    this.tag = tag;
    this.render();
  },

});


const index = new IndexView(); // eslint-disable-line

const hash = window.location.hash;
if (hash) {
  $('.drawer-fullnav a[href="' + hash + '"]').addClass('active');
}

$('.drawer-fullnav a').click(function (ev) {
  ev.preventDefault();
  index.showTag(this.hash.slice(1));
  window.location.hash = this.hash;

  $('.drawer').drawer('hide');

  $('html,body').scrollTop( $('.post-grid').scrollTop() );
});
