(function ($) {

  var hash = window.location.hash;
  if (hash) $('.nav-pills a[href="' + hash + '"]').tab('show');

  $('.nav-pills a').click(function () {
    $(this).tab('show');
    var scrollmem = $('body').scrollTop() || $('html').scrollTop();
    window.location.hash = this.hash;
    $('html,body').scrollTop(scrollmem);
  });

}(window.jQuery));
