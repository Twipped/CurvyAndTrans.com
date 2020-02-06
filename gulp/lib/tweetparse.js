var twemoji = require('twemoji' );
const { deepPick, has } = require('./util');

const schema = {
  id_str: true,
  created_at: true,
  user: {
    screen_name: true,
    avatar: true,
    name_html: true,
    verified: true,
    protected: true,
  },
  html: true,
  quoted_status: {
    user: {
      screen_name: true,
      avatar: true,
      name_html: true,
      verified: true,
      protected: true,
    },
  },
  entities: { media: [ {
    type: true,
    media_url_https: true,
    video_info: { variants: [ {
      url: true,
      content_type: true,
    } ] },
  } ] },
  media: true,
};

var entityProcessors = {
  hashtags (tags, tweet) {
    tags.forEach((tagObj) => {
      tweet.html = tweet.html.replace('#' + tagObj.text, `<a href="https://twitter.com/hashtag/{tagObj.text}" class="hashtag">#${tagObj.text}</a>`);
    });
  },

  symbols (/* symbols, tweet */) {

  },

  user_mentions (users, tweet) {
    users.forEach((userObj) => {
      var regex = new RegExp('@' + userObj.screen_name, 'gi' );
      tweet.html = tweet.html.replace(regex, `<a href="https://twitter.com/${userObj.screen_name}" class="mention">@${userObj.screen_name}</a>`);
    });
  },

  urls (urls, tweet) {
    urls.forEach((urlObj) => {
      var quotedTweetHtml = '';
      var indices = urlObj.indices;
      var urlToReplace = (tweet.full_text || tweet.text).substring(indices[0], indices[1]);

      var finalText = quotedTweetHtml || urlObj.display_url.link(urlObj.expanded_url);
      tweet.html = tweet.html.replace(urlToReplace, finalText);
    });
  },

  media (media, tweet) {
    media.forEach((mediaObj) => {
      tweet.html = tweet.html.replace(mediaObj.url, '');
      return;

      // if (mediaObj.type === 'photo') {
      //   // Use HTTPS if available
      //   var src = mediaObj.media_url_https ? mediaObj.media_url_https : mediaObj.media_url;

      //   if (options &&
      //     options.photoSize &&
      //     mediaObj.sizes &&
      //     mediaObj.sizes[options.photoSize]) {
      //     // If specified size is available, patch image src to use it
      //     src = src + ':' + options.photoSize;
      //   }

      //   tweet.html = tweet.html.replace(mediaObj.url, `<img src="${src}" alt=""/>`);
      // } else if (mediaObj.type === 'video') {
      //   var source = '';
      //   mediaObj.video_info.variants.forEach((info) => {
      //     source += `<source src="${info.url}" type="${info.content_type}">`;
      //   });
      //   var video = `<video controls poster="${mediaObj.media_url}">${source}</video>`;
      //   tweet.html = tweet.html.replace(mediaObj.url, video);
      // }
    });
  },
};

module.exports = exports = function (tweets) {
  return Array.isArray(tweets) ? tweets.map(parseTweet) : parseTweet(tweets);

  function parseTweet (tweet) {
    // clone the tweet so we're not altering the original
    tweet = JSON.parse(JSON.stringify(tweet));

    tweet.user.avatar = {
      input: tweet.user.profile_image_url_https,
      output: 'tweets/' + tweet.user.screen_name + '.jpg',
    };

    tweet.media = [
      tweet.user.avatar,
    ];

    // Copying text value to a new property html. The final output will be set to this property
    tweet.html = (tweet.full_text || (tweet.full_text || tweet.text)).replace(/(\r\n|\n\r|\r|\n)/g, '<br>');

    if (tweet.quoted_status) {
      tweet.quoted_status = parseTweet(tweet.quoted_status);
    }

    if (has(tweet, 'entities.media') && has(tweet, 'extended_entities.media')) {
      tweet.entities.media = tweet.extended_entities.media;
      delete tweet.extended_entities;
    }

    // Process entities
    if (Object.getOwnPropertyNames(tweet.entities).length) {
      for (let [ entityType, entity ] of Object.entries(tweet.entities)) { // eslint-disable-line prefer-const
        entityProcessors[entityType](entity, tweet);
      }
    }

    // Process Emoji's
    tweet.html = twemoji.parse(tweet.html);
    tweet.user.name_html = twemoji.parse(tweet.user.name);

    return deepPick(tweet, schema);
  }

};
