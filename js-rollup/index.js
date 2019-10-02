
import Backbone from 'backbone';
import Handlebars from 'handlebars/dist/handlebars';
import postsJSON from '../posts-sans.json';
import htmlGrid from '../templates/index-grid.hbs.html';
import htmlGridCell from '../templates/index-cell.hbs.html';
import htmlGridCard from '../templates/index-card.hbs.html';
import { groupBy, reduce, debounce } from 'lodash';
import dateFormat from 'date-fns/format';
import hhFirst from 'helper-hoard/src/helpers/collection/first';

Handlebars.registerPartial('indexCell', Handlebars.compile(htmlGridCell));
Handlebars.registerPartial('indexCard', Handlebars.compile(htmlGridCard));

Handlebars.registerHelper('rev', (url) => (url && (url[0] === '/' ? url : '/' + url) || ''));
Handlebars.registerHelper('date', (format, date) => dateFormat(date, format));
Handlebars.registerHelper('first', hhFirst.first(Handlebars));

const IndexView = Backbone.View.extend({
  el: '#body',
  template: Handlebars.compile(htmlGrid),

  initialize () {
    this.loaded = 20;
    this.step = 20;

    const byState = groupBy(postsJSON, (p) => (p.draft ? 'draft' : 'final'));

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

    [ this.first, ...this.posts ] = byState.final;

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
    // return;
    var data;

    if (this.tag) {

      data = {
        posts: {
          first: null,
          ordered: this.byTag[this.tag] || [],
        },
        full: true,
      };

    } else {

      data = {
        posts: {
          first: this.first,
          ordered: this.posts.slice(0, this.loaded),
        },
        full: this.loaded >= this.posts.length,
      };

    }

    const html = this.template(data);

    this.$el.html(html);

    if (window.twttr) {
      window.twttr.widgets.load(
        this.$el[0]
      );
    }

    if (!data.full) this.checkBottom();
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
