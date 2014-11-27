var chromecastjs = require('chromecast-js');
var browser = new chromecastjs.Browser();
var tortuga = require('tortuga');
var peerflix = require('peerflix');
var address = require('network-address');

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
  this.device;
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

  // callback for when we get back the results
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
  });

  // close modal when 'X' is clicked
  $('body').on('click', '.hamb-wrap', function() {
    $('.modal')
      .removeClass('active')
      .html('');
    $('body').removeClass('modal-open');
  });

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
  var resultsLength = results.length >= 5 ? 5 : results.length;

  // please god, forgive me (ಥ﹏ಥ)
  // creates table to display torrent results in modal
  $('.modal-wrap').append(
    $('<table />', {class: 'torrent-results'} )
      .append(
        $('<th />', {text: 'Title'}),
        $('<th />', {text: 'Seeders'}),
        $('<th />', {text: 'Leechers'})
      )
  );
  for (var i = 0; i < resultsLength; i++) {
    var title = truncateString(results[i].title, 50);

    $('.torrent-results').append(
      $('<tr />').append( 
        $('<td />', {text: title }),
        $('<td />', {text: results[i].seeders }),
        $('<td />', {text: results[i].leechers }),
        $('<td />').html('<button class="cast">Cast</button>')
      )
    );
  }

  $('.cast').on('click', function() {
    self.castVideo(results);
  });
}

TorrentStream.prototype.castVideo = function(results) {
  var self = this;
  // passes magnet link from results to node torrent stream
  var engine = peerflix(results[0].magnet, {});

  // torrent begins to download
  engine.server.on('listening', function() {
    var host = address()
    // generate local url to send to chromecast
    var href = 'http://' + host + ':' + engine.server.address().port + '/';
    console.log('streaming movie on ' + href);

    // send url to chromecast
    self.device.play(href, 60, function(){
      console.log('Now streaming to chromecast!')
    });
  });
}

var stream = new TorrentStream().init();