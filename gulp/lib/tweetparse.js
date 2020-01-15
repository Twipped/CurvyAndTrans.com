var twemoji = require('twemoji' );

module.exports = exports = function (tweets) {
  return Array.isArray(tweets) ? tweets.map(parseTweet) : parseTweet(tweets);

  function parseTweet (tweet) {
    var entityProcessors = {
      hashtags: processHashTags,
      symbols: processSymbols,
      user_mentions: processUserMentions,
      urls: processUrls,
      media: processMedia,
    };

    var entities = tweet.entities;
    var processorObj;

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
      exports(tweet.quoted_status);
    }

    // Process entities
    if (Object.getOwnPropertyNames(entities).length) {
      Object.keys(entities).forEach((entity) => {
        if (entities[entity].length) {
          processorObj = entities[entity];

          // Need to check if entity is media. If so, extended_entities should be used
          processorObj = entity === 'media' ? tweet.extended_entities.media : processorObj;

          entityProcessors[entity](processorObj, tweet);
        }
      });
    }

    // Process Emoji's
    tweet.html = twemoji.parse(tweet.html);
    tweet.user.name_html = twemoji.parse(tweet.user.name);

    return tweet;
  }

  function processHashTags (tags, tweet) {
    tags.forEach((tagObj) => {
      var anchor = ('#' + tagObj.text).link('http://twitter.com/hashtag/' + tagObj.text);
      tweet.html = tweet.html.replace('#' + tagObj.text, anchor);
    });
  }

  function processSymbols (symbols, tweet) {} // eslint-disable-line

  function processUserMentions (users, tweet) {
    users.forEach((userObj) => {
      var anchor = ('@' + userObj.screen_name).link('http://twitter.com/' + userObj.screen_name);
      var regex = new RegExp('@' + userObj.screen_name, 'gi' );
      tweet.html = tweet.html.replace(regex, anchor);
    });
  }

  function processUrls (urls, tweet) {
    urls.forEach((urlObj) => {
      var quotedTweetHtml = '';
      var indices = urlObj.indices;
      var urlToReplace = (tweet.full_text || tweet.text).substring(indices[0], indices[1]);

      var finalText = quotedTweetHtml || urlObj.display_url.link(urlObj.expanded_url);
      tweet.html = tweet.html.replace(urlToReplace, finalText);
    });
  }

  function processMedia (media, tweet) {
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
  }

};
