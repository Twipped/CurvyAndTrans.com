/** @jsx h */

import { h } from 'preact';
import map from 'lodash/map';
import dateFormat from 'date-fns/format';
import * as Icons from './icons';

const Raw = ({ html }) => <span dangerouslySetInnerHTML={{ __html: html }} />;

const MediaEntity = ({ entity }) => (
  <div class="tweet-entity">
    {entity.type === 'photo' &&
      <a class="tweet-photo lb" style={{ backgroundImage: `url(${entity.media_url_https}?name=medium)` }} href={entity.media_url_https}>
        <img src={`${entity.media_url_https}?name=medium`} />
      </a>
    }
    {entity.type === 'video' &&
      <video controls poster={entity.media_url_https} class="tweet-video">
        {map(entity.video_info.variants, (v) => <source src={v.url} type={v.content_type} />)}
      </video>
    }
    {entity.type === 'animated_gif' &&
      <video controls muted loop autoPlay poster={entity.media_url_https} class="tweet-video">
        {map(entity.video_info.variants, (v) => <source src={v.url} type={v.content_type} />)}
      </video>
    }
  </div>
);

const Quoted = ({ tweetid, tweets }) => {
  const tweet = tweets[tweetid];
  if (!tweet) return <div className="tweet-quoted missing">Quoted Tweet Unavailable</div>;

  return (
    <div className="tweet-quoted">
      <a href={`https://twitter.com/${tweet.user.screen_name}/status/${tweet.id_str}`} target="_blank" rel="noopener noreferrer">
        <strong><Raw html={tweet.user.name_html} /></strong>
        <span>@{tweet.user.screen_name}</span>
      </a>
      {tweet.quoted_status_id_str && <Quoted tweetid={tweet.quoted_status_id_str} tweets={tweets} />}
      <div className="tweet-quoted-text"><Raw html={tweet.html} /></div>
    </div>
  );
};

const Tweet = ({ tweetid, tweets, rev }) => {
  const tweet = tweets[tweetid];
  const media = (tweet.extended_entities && tweet.extended_entities.media) || (tweet.entities && tweet.entities.media);
  const date = new Date(tweet.created_at);

  return (
    <div className="tweet-item" data-id={tweet.id_str}>
      <a className="tweet-link" href={`https://twitter.com/${tweet.user.screen_name}/status/${tweet.id_str}`} target="_blank" rel="noopener noreferrer"><Icons.Link /></a>
      <a className="tweet-header" href={`https://twitter.com/${tweet.user.screen_name}`} target="_blank" rel="noopener noreferrer">
        <span className="tweet-avatar"><img src={rev(tweet.user.avatar.output)} alt="" /></span>
        <strong className="tweet-displayname">
          <Raw html={tweet.user.name_html} />
          {tweet.user.verified && <i className="tweet-verified">&nbsp;</i>}
          {tweet.user.protected && <i className="tweet-protected">&nbsp;</i>}
        </strong>
        <span className="tweet-username">@{tweet.user.screen_name}</span>
        <i className="tweet-logo">&nbsp;</i>
      </a>
      {tweet.quoted_status_id_str && <Quoted tweetid={tweet.quoted_status_id_str} tweets={tweets} />}
      <div className="tweet-text"><Raw html={tweet.html} /></div>
      {media &&
        <div className={`tweet-entities lightbox entity-count-${media.length} entity-type-${media[0].type}`}>
          <div className="tweet-entities-inner"><div><div className="tweet-entities-grid">
            {map(media, (e) => <MediaEntity entity={e} />)}
          </div></div></div>
        </div>
      }
      <div className="tweet-footer">
        <a
          className="tweet-date"
          href={`https://twitter.com/${tweet.user.screen_name}/status/${tweet.id_str}`}
          target="_blank"
          rel="noopener noreferrer"
        >{dateFormat(date, 'h:mm aa - LLL do, yyyy')}</a>
      </div>
    </div>
  );
};

const Tweets = ({ ids, tweets, rev, className, style }) => {
  const classes = [ 'tweet', ...className.split(' ') ];
  if (ids.length === 1) classes.push('single');

  return <div class={classes.join(' ')} style={style}>{map(ids, (id) => <Tweet tweetid={id} tweets={tweets} rev={rev} />)}</div>;
};

export default Tweets;
