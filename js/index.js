
(function ($) {
  $(function () {
    $('.load-more').on('click', function () {
      $.get('/extra.html', function (body) {
        $('.post-grid').append(body);
        $('.load-more').hide();
      });
    });
  });
}(window.jQuery));
