/** @jsx h */

import { h, render, Component, Fragment } from 'preact';
import map from 'lodash/map';
import IndexCard from './components/index-card';
import * as Icons from './components/icons';
import VisibilitySensor from 'react-visibility-sensor';

const INDEX_JSON = '/p/index.json';
const INITIAL_DISPLAY = 8;
const DISPLAY_STEP = 10;



class App extends Component {

  constructor (props) {
    super(props);

    const hash = window.location.hash.slice(1);
    const index = this.props.index;
    if (index) {
      this.state = {
        hash,
        display: INITIAL_DISPLAY,
        loading: false,
        posts: index.posts || [],
        tags: index.tags || {},
        revManifest: index.rev || {},
      };
    } else {
      this.state = {
        hash,
        display: INITIAL_DISPLAY,
        loading: true,
        posts: [],
        tags: {},
        revManifest: {},
      };
      this.loadContent().catch(console.error); // eslint-disable-line no-console
    }

    this.loading = new Map();

    this.onChange = this.onChange.bind(this);
    this.onMoreVisible = this.onMoreVisible.bind(this);
  }

  async loadContent () {
    const index = await fetch(INDEX_JSON).then((res) => res.json());
    this.setState({
      loading: false,
      posts: index.posts || [],
      tags: index.tags || {},
      revManifest: index.rev || {},
    });
  }

  componentDidMount () {
    window.addEventListener('hashchange', this.onChange);
  }

  componentWillUnmount () {
    window.removeEventListener('hashchange', this.onChange);
  }

  onChange () {
    this.setState({
      hash: window.location.hash.slice(1),
      prevHash: this.state.hash,
    });
  }

  onMoreVisible (isVisible) {
    if (!isVisible) return;
    this.setState({ display: this.state.display + DISPLAY_STEP });
  }

  render () {
    const { loading, hash, posts: allPosts, display, tags, revManifest } = this.state;
    const tag = hash || '';
    const posts = tag
      ? allPosts.filter((p) => p.tags[tag])
      : allPosts.slice(0, display)
    ;
    const full = tag || display >= allPosts.length;

    if (loading) {
      return <div class="loading"><Icons.Sync /></div>;
    }


    function rev (url) {
      if (!url) return '';
      if (url[0] === '/') url = url.substr(1);
      if (revManifest[url]) return '/' + revManifest[url];
      return '/' + url;
    }

    const caption = tag
      ? <span>Posts about {tags[tag] || tag}</span>
      : <span>Latest Posts</span>
    ;

    return (
      <Fragment>
        <h3 class="tagged-header">
          {caption}
          <button type="button" class="btn btn-primary btn-sm" data-toggle="drawer" href="#drawer"><Icons.Tags /><span>&nbsp;Filter By Tag</span></button>
        </h3>
        <div class="card-grid">
          {map(posts, (post, i) =>
            <IndexCard post={post} key={i} rev={rev} />,
          )}
        </div>
        {!full && <VisibilitySensor partialVisibility onChange={this.onMoreVisible}><div class="load-more">
          <div class="loading" style={{ minHeight: '100px' }}><Icons.Sync /></div>
        </div></VisibilitySensor>}
      </Fragment>
    );
  }
}


async function run () {
  const target = document.querySelector('#body');

  let index = null;
  if (window.location.hash.length <= 1) {
    index = await fetch(INDEX_JSON).then((res) => res.json());
  }

  while (target.firstChild) target.removeChild(target.firstChild);
  render(<App index={index} />, target);
}

run().catch(console.error); // eslint-disable-line


/** DRAWER CODE ------------------------------------------------------ */

const hash = window.location.hash;
if (hash) {
  $('.drawer-fullnav a[href="' + hash + '"]').addClass('active');
}

window.jQuery('.drawer-fullnav a').click(function (ev) {
  if (!this.hash) return;
  ev.preventDefault();
  window.location.hash = this.hash;

  $('.drawer').drawer('hide');

  $('html,body').scrollTop( $('.post-grid').scrollTop() );
});
