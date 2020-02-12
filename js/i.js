
(function (window, document, navigator) {
  const me = document.currentScript;
  const url = me.getAttribute('data-url');
  const iOS = !!navigator.platform && /iPad|iPhone|iPod/.test(navigator.platform);

  const vendor = navigator.vendor;
  const doNotTrack = navigator.doNotTrack || navigator.msDoNotTrack || window.doNotTrack;

  let tid = !doNotTrack && window.localStorage.getItem('tid');
  if (!tid && !doNotTrack) {
    tid = Math.round(Math.random() * 1000000000);
    window.localStorage.setItem('tid', tid);
  }

  const body = document.body;
  const html = document.documentElement;

  const SESSION_DATA = {
    tid,
    start: Date.now(),
    end: null,
    maxScroll: 0,
    href: window.location.pathname,
    language: navigator.userLanguage || navigator.language,
  };

  // listen for all the exit events
  window.addEventListener('pagehide', endSession);
  window.addEventListener('beforeunload', endSession);
  window.addEventListener('unload', endSession);
  // for iOS when the focus leaves the tab
  if (iOS) window.addEventListener('blur', endSession);
  window.addEventListener('load', sendSession);


  // scroll tracking
  window.addEventListener('scroll', function () {
    const pageHeight = Math.max(
      body.scrollHeight,
      body.offsetHeight,
      html.clientHeight,
      html.scrollHeight,
      html.offsetHeight,
    );

    const viewportHeight = Math.max(html.clientHeight, window.innerHeight || 0);
    const maxScroll = Math.max(SESSION_DATA.maxScroll, window.scrollY);

    const viewed = maxScroll === 0 ? 0 : Math.round(((maxScroll + viewportHeight) / pageHeight) * 100);

    Object.assign(SESSION_DATA, { pageHeight, viewportHeight, maxScroll, viewed });
  });


  let skip;
  function endSession () {
    if (skip) return;
    skip = true;
    SESSION_DATA.end = Date.now();
    sendSession();
  }

  // call this function on exit
  function sendSession () {
    const params = new URLSearchParams(SESSION_DATA);
    const data = params.toString();

    // Instead, send an async request
    // Except for iOS :(
    const async = !iOS;
    const request = new XMLHttpRequest();
    request.open('GET', url + '?' + data, async); // 'false' makes the request synchronous
    request.setRequestHeader('Content-Type', 'application/json');
    request.send(data);

    // Synchronous request cause a slight delay in UX as the browser waits for the response
    // I've found it more performant to do an async call and use the following hack to keep the loop open while waiting

    // Chrome doesn't care about waiting
    if (!async || ~vendor.indexOf('Google')) return;

    // Latency calculated from navigator.performance
    const latency = data.latency || 0;
    const t = Date.now() + Math.max(300, latency + 200);
    while (Date.now() < t) {
      // postpone the JS loop for 300ms so that the request can complete
      // a hack necessary for Firefox and Safari refresh / back button
    }
  }
}(window, document, navigator));
