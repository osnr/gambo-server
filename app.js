// Read dropbox key and secret from the command line.
var consumer_key = process.argv[2]
, consumer_secret = process.argv[3];

if (consumer_key == undefined || consumer_secret == undefined) {
	console.log("Usage: node app.js <dropbox key> <dropbox secret>");
	process.exit(1);
}

var sys = require('util'),
everyauth = require('everyauth'),
express = require('express'),
dbox = require('dbox'),
RedisStore = require('connect-redis')(express);

var dbox_app = dbox.app({ 'app_key': consumer_key, 'app_secret': consumer_secret });

var usersById = {};
var clientsById = {};

everyauth.dropbox
	.consumerKey(consumer_key)
	.consumerSecret(consumer_secret)
	.findOrCreateUser( function (sess, accessToken, accessSecret, user) {
		if (!(user.uid in clientsById)) {
			user.id = user.uid;

			clientsById[user.uid] = dbox_app.createClient({
				oauth_token_secret: accessSecret,
				oauth_token: accessToken,
				uid: user.uid
			});
		}
		return usersById[user.uid] || (usersById[user.uid] = user);
	})
	.redirectPath('/open');

everyauth.everymodule
	.findUserById( function(uid, callback) {
		callback(null, usersById[uid]);
	});

// Create and configure an Express server.
var app = express.createServer();
app.configure(function () {
	app.use(express.static(__dirname + '/public'))
	app.use(express.logger());
	app.use(express.bodyParser());
	app.use(express.cookieParser());
	app.use(express.session({ secret: 'super-secret secret', store: new RedisStore } ));
	app.use(everyauth.middleware());
});

everyauth.helpExpress(app);

// Login page.
app.get('/', function (req, res) {
	res.render('home.jade', {
		locals: {
			title: 'Authorize Gambo',
		}
	});
});

// File browser page.
app.get('/open(/*)?', function (req, res) {
	// Fetch target metadata and render the page.
	if (req.loggedIn) {
		var client = clientsById[req.user.uid];
		client.metadata(req.params[1] || '', {}, function(status, metadata) {
			res.render('open.jade', {
				locals: {
					title: 'Dropbox File Browser',
					current_dir: (metadata.path.length > 0) ? metadata.path : 'root',
					items: metadata.contents.filter(function(el) {
						return el.path.match(/\.[Ss]?[Gg][Bb][Cc]?$/);
					})
				}
			});
		});
	} else {
		res.render('open.jade', {
			locals: {
				title: 'Dropbox File Browser'
				//			, current_dir: (metadata.path.length > 0) ? metadata.path : 'root'
				//			, items: metadata.contents
			}
		});
	}
});

app.get('/gambo', function(req, res) {
	res.render('gambo.jade', {layout: false});
});

app.get('/rom/:path', function (req, res) {
	var path = req.params.path;

	if (!path.match(/\.[Ss]?[Gg][Bb][Cc]?$/)) return;

	var client = clientsById[req.user.uid];

	client.get(path, function(status, rom, metadata) {
		res.contentType('application/octet-stream');
		res.send(new Buffer(rom).toString('base64'));
		console.log("ROM request made");
	});
});

app.listen(8124);
console.log('Dropbox browser running on port ' + app.address().port);
