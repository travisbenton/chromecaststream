// NOTES
// self.device.playing is true while streaming

var chromecastjs = require('chromecast-js');
var browser = new chromecastjs.Browser();
var tortuga = require('tortuga');
var peerflix = require('peerflix');
var address = require('network-address');
var codein = require("node-codein");

// helper functions 
function truncateString(string, length){
  if (string.length > length) { return string.substring(0, length) + '...'; } 
  else { return string; }
};

// Constructor 
function TorrentStream() {
  this.debugFront = false;
  this.apikey     = 'dk6rs3fvy6d4eruntrxczh6f';
  this.num        = 15;
  this.resultType = {
    newRelease:    'lists/dvds/new_releases.json',
    movieSearch: 'movies.json'
  }
  this.nowPlaying = {
    title: ''
  }
  this.device;
  this.debug = true;
}

TorrentStream.prototype.init = function() {
  var url = 'http://api.rottentomatoes.com/api/public/v1.0/' 
    + this.resultType.newRelease + '?apikey=' 
    + this.apikey + '&page_limit=' 
    + this.num + '&callback=?';

  this.loadMovieData(url);
  this.buildModal();
  this.connectToDevice();
}

TorrentStream.prototype.loadMovieData = function(url, searchTerm) {
  $.ajax({
    url: url,
    dataType: "jsonp",
    success: searchCallback
  });

  // append movie posters
  function searchCallback(data) {
    var fadeOutDuration = 300;
    var fadeInDelay = 50;
    var posterLength = data.movies.length >= 15 ? 15 : data.movies.length;

    // update search term
    if (searchTerm) {
      $('.search-term').text('Showing search results for: ' +  searchTerm);
    }

    // fade out current movies
    $('.poster').velocity('transition.expandOut', {duration: fadeOutDuration});

    // fill in movie posters and add metadata as data attr
    for (var i = 0; i < posterLength; i++) {
      var movie = data.movies[i];
      var rating = movie.ratings.critics_score === -1 
        ? 'No consensus' 
        : movie.ratings.critics_score + '%';
      var synopsis = movie.synopsis == '' 
        ? 'No synopsis available.'
        : movie.synopsis;
      var backgroundUrl = movie.posters.detailed.replace('tmb', 'det');
      
      var info = {
        title    : movie.title,
        score    : rating,
        synopsis : synopsis,
        poster   : backgroundUrl
      }

      var $poster = $('<div/>', { class: 'poster' }).appendTo('.wrap');
      
      $poster
        .css({ backgroundImage: 'url(' + backgroundUrl + ')' })
        .velocity('transition.slideUpBigIn', {
          delay: (fadeInDelay * i) + fadeOutDuration
        })
        .data('info', info);
    }
  }
}

TorrentStream.prototype.buildModal = function() {
  var self = this;

  $('body').on('click', '.poster', function() {
    var cast;
    var data = $(this).data();
    var data = data.info;

    // TO DO: Templatize
    $('.modal')
      .addClass('active')
      .html(
        '<div class="modal-wrap">' + 
        '<div class="hamb-wrap">' +
          '<div class="hamb"></div>' +
        '</div>' +
          '<h1>' + data.title + '</h1>' + 
          '<h2> Rotten Tomatoes Score: ' + data.score + '</h2>' + 
          '<p class="synopsis cf">' + 
            '<img src="' + data.poster + '">' + 
            data.synopsis + 
          '</p>' +
        '</div>'
      )

    $('body').addClass('modal-open');
    self.searchPB(data.title);
    self.nowPlaying.title = data.title;
  });

  // close modal when 'X' is clicked
  $('body').on('click', '.hamb-wrap', closeModal);
  // close modal when 'ESC' is pressed
  $(document).keyup(function(e) {
    if (e.keyCode == 27) { closeModal() }
  });

  function closeModal() {
    $('.modal')
        .removeClass('active')
        .html('');
    $('body').removeClass('modal-open');
  }

  // Trigger RT search on enter keypress
  $('.search-input').bind("enterKey",function(e){
    var searchTerm = $('.search-input').val();
    var url = 'http://api.rottentomatoes.com/api/public/v1.0/' 
      + self.resultType.movieSearch 
      + '?apikey=' + self.apikey 
      + '&page_limit=' + self.num 
      + '&q=' + encodeURIComponent(searchTerm)
      + '&callback=?';

    self.loadMovieData(url, searchTerm);
  });
  
  $('.search-input').keyup(function(e){
    if(e.keyCode == 13) {
      $(this).trigger("enterKey");
    }
  });
}

TorrentStream.prototype.connectToDevice = function() {
  var self = this;

  // chromecast is detected
  browser.on('deviceOn', function(device){
    device.connect()
    self.device = device;
  });
}

TorrentStream.prototype.searchPB = function(video) {
  var self = this;

  // when connected...
  // this.device.on('connected', function(){
    // search piratebay
    tortuga.search({
      query: video, 
      sortType: 'seeders', 
      category: 'video'
    }, function(results) {
      self.displayResults(results);
    })
  // });
}

TorrentStream.prototype.displayResults = function(results) {
  var self = this;
  var resultsLength = results.length >= 5 ? 5 : results.length;

  // please god, forgive me (ಥ﹏ಥ)
  // creates table to display torrent results in modal
  //
  // TO DO: Templatize
  $('.modal-wrap').append(
    $('<table />', {class: 'torrent-results'})
      .append(
        $('<th />'),
        $('<th />', {text: 'Title'}),
        $('<th />', {text: 'Seeders'}),
        $('<th />', {text: 'Leechers'})
      )
  );
  for (var i = 0; i < resultsLength; i++) {
    var title = truncateString(results[i].title, 70);

    $('.torrent-results').append(
      $('<tr />').append( 
        $('<td />').html('<button class="cast" data-torrent-rank="'+ i +'">Play &#9658</button>'),
        $('<td />', {text: title }),
        $('<td />', {text: results[i].seeders }),
        $('<td />', {text: results[i].leechers })
      )
    );
  }

  $('.cast').on('click', function() {
    var index = $(this).data('torrent-rank');
    // cast local video if debugging (avoids my having to download
    // a torrent every time I test something)
    if (self.debug) {
      self.device.play('https://ia700408.us.archive.org/26/items/BigBuckBunny_328/BigBuckBunny_512kb.mp4', 0, function(){
        console.log('Now streaming to chromecast!');

        self.nowPlaying.title = 'Big Buck Bunny';
        self.playBar(arguments[1]);
      });
    } else {
      self.castVideo(results[index]);
    }
  });
}

TorrentStream.prototype.castVideo = function(results) {
  var self = this;
  // passes magnet link from results to node torrent stream
  var engine = peerflix(results.magnet, {});
  // torrent begins to download
  engine.server.on('listening', function() {
    var host = address()
    // generate local url to send to chromecast
    var href = 'http://' + host + ':' + engine.server.address().port + '/';
    console.log('streaming movie on ' + href);
    // send url to chromecast
    self.device.play(href, 0, function(){
      console.log('Now streaming to chromecast!')
      self.playBar(arguments[1]);
    });
  });
}

TorrentStream.prototype.playBar = function(slidePos) {
  var self = this;
  var $nowPlaying = $('<div />', { 
    class: 'now-playing'
  });

  // TO DO: Templatize
  $nowPlaying.html(
    '<div class="control-wrap">' +
      '<a class="stop control">' +
        '<i class="fa fa-stop"></i>' +
      '</a>' + 
      '<a class="pause control">' + 
        '<i class="fa fa-pause"></i>' +
      '</a>' +
      '<a class="play control">' + 
        '<i class="fa fa-play"></i>' +
      '</a>' +
    '</div>' + 

    '<span class="control-text">' +
      'Now playing: ' + self.nowPlaying.title + 
    '</span>' 
  )

  $('body').append($nowPlaying);
  $nowPlaying.velocity('transition.slideUpBigIn');

  $('body')
    .on('click', '.stop', function() {
      self.device.stop();
      $(this).velocity({ opacity: 0 }, { 
        complete: function() {
          $(this).css({ display: "none" })
          $('.play').velocity(
            { opacity: 1 }, 
            { display: "inline" }
          );
          $('.control-text').html(
            self.nowPlaying.title + ' has been stopped'
          );
        } 
      });
      $('.pause').velocity({ opacity: 0 }, { display: "none" });
    })
    .on('click', '.pause', function() {
      self.device.pause();
      $(this).velocity({ opacity: 0 }, { 
        complete: function() {
          $(this).css({ display: "none" })
          $('.play').velocity(
            { opacity: 1 }, 
            { display: "inline" }
          );
          $('.control-text').html(
            self.nowPlaying.title + ' is paused'
          );
        } 
      });
      $('.stop').velocity({ opacity: 0 }, { display: "none" });
    })
    .on('click', '.play', function() {
      self.device.play();
      $(this).velocity({ opacity: 0 }, { 
        complete: function() {
          $(this).css({ display: "none" })
          $('.pause, .stop').velocity(
            { opacity: 1 }, 
            { display: "inline" }
          );
          $('.control-text').html(
            'Now playing: ' + self.nowPlaying.title
          );
        }
      });
    })
}

var stream = new TorrentStream().init();