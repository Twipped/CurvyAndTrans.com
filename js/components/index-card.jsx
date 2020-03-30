/** @jsx h */

import { h, Fragment } from 'preact';
import map from 'lodash/map';
import dateFormat from 'date-fns/format';
import Tweets from './tweet';

const WithTweet = ({ post, rev }) => (
  <div className={[ 'grid-card', ...post.classes ].join(' ')} data-id={post.id}>
    <a href={post.url} className="grid-date">
      <span class="grid-date-value">{dateFormat(new Date(post.date), 'MMM do, yyyy')}</span>
      <span class="emdash">&mdash;</span>
      <span class="grid-tag">{Object.values(post.tags)[0]}</span>
    </a>
    <Tweets ids={post.tweet} tweets={post.tweets} className="grid-tweet" rev={rev} />
    {!post.flags.hideTitle && <Fragment>
      {post.title && <a href={post.url} className="grid-title h2">{post.title}</a>}
      {post.subtitle && <a href={post.url} className="grid-subtitle">{post.subtitle}</a>}
      {post.description && <a href={post.url} className="grid-description">{post.description}</a>}
      {post.preview && <Fragment>
        <a href={post.url} className="grid-preview"><div dangerouslySetInnerHTML={{ __html: post.preview }} /></a>
        <div class="grid-readmore-shade" />
      </Fragment>}
    </Fragment>}
  </div>
);

const WithoutTweet = ({ post, rev }) => {
  let sizes = '(max-width: 576px) 40vw, (max-width: 1024px) 15vw, 576px';
  if (post.flags.isWide) sizes = '(max-width: 576px) 100vw, (max-width: 1024px) 100vw, 1024px';
  if (post.flags.isSquare) {
    if (post.flags.noPreview) sizes = '(max-width: 576px) 20vw, (max-width: 1024px) 25vw, 1024px';
    else sizes = '(max-width: 576px) 100vw, (max-width: 1024px) 50vw, 576px';
  }

  return (
    <a href={post.url} className={[ 'grid-card', ...post.classes ].join(' ')} data-id={post.id}>
      <div class="grid-date">
        <span class="grid-date-value">{dateFormat(new Date(post.date), 'MMM do, yyyy')}</span>
        <span class="emdash">&mdash;</span>
        {map(post.tags, (t) => <span class="grid-tag">{t}</span>)}
      </div>

      {post.flags.hasPoster &&
        <div class="grid-poster">
          <img
            src={rev(post.poster[0].url)}
            alt=""
            srcSet={map(post.poster, (poster) => rev(poster.url) + ' ' + poster.width + 'w').join(',')}
            sizes={sizes}
          />
        </div>
      }
      {!post.flags.hideTitle && <Fragment>
        {post.title && <a href={post.url} className="grid-title h2">{post.title}</a>}
        {post.subtitle && <a href={post.url} className="grid-subtitle">{post.subtitle}</a>}
        {post.description && <a href={post.url} className="grid-description">{post.description}</a>}
        {post.preview && <Fragment>
          <a href={post.url} className="grid-preview"><div dangerouslySetInnerHTML={{ __html: post.preview }} /></a>
          <div class="grid-readmore-shade" />
        </Fragment>}
      </Fragment>}
    </a>
  );
};

const IndexCard = (props) => ( props.post.flags.hasTweet ? WithTweet(props) : WithoutTweet(props) ); // eslint-disable-line

export default IndexCard;
