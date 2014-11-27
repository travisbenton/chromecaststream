var chromecastjs = require('chromecast-js');
var browser = new chromecastjs.Browser();
var tortuga = require('tortuga');
var peerflix = require('peerflix');
var address = require('network-address');
var debug = true;

if (debug === true) {
	cast(process.argv[2])
}

function cast(video) {
	// chromecast is detected
	browser.on('deviceOn', function(device){
	  device.connect()
	  // when connected...
	  device.on('connected', function(){
	  	// search piratebay
	  	// query is search string, sorts by most seeded, only includes videos
			tortuga.search(
			{
				query: video, 
				sortType: 'seeders', 
				category: 'video'
			}, function(results) {
			  // passes magnet link from results to node torrent stream
			  var engine = peerflix(results[0].magnet, {});

			  // torrent begins to download
				engine.server.on('listening', function() {
					var host = address()
					// generate local url to send to chromecast
					var href = 'http://' + host + ':' + engine.server.address().port + '/';
					console.log(href);

					// send url to chromecast
			    device.play(href, 60, function(){
			      console.log('Playing in chromecast!')
			    });
				});
			})
	  });
	});
}