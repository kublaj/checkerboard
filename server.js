var http = require("http"),
    url = require("url"),
    path = require("path"),
    fs = require("fs"),
    port = process.argv[2] || 8888;

http.createServer(function(request, response) {

  var uri = url.parse(request.url).pathname, filename = path.join(process.cwd(), uri);

  fs.exists(filename, function(exists) {
    if(!exists) {
      response.writeHead(404, {"Content-Type": "text/plain"});
      response.write("404 Not Found\n");
      response.end();
      return;
    }

    if (fs.statSync(filename).isDirectory()) filename += '/index.html';

    fs.readFile(filename, "binary", function(err, file) {
      if(err) {
        response.writeHead(500, {"Content-Type": "text/plain"});
        response.write(err + "\n");
        response.end();
        return;
      }

      response.writeHead(200);
      response.write(file, "binary");
      response.end();
    });
  });
}).listen(parseInt(port, 10));

console.log("Static file server running at\n  => http://localhost:" + port + "/\nCTRL + C to shutdown");

var WebSocket = require('ws');
//var Datastore = require('nedb');
Object.assign = require('object-assign');

var WebSocketServer = new WebSocket.Server({'port': 904});
var State = {};

function unStringReplace(val) {
  if (val === '$$null$$')
    return null;

  if (val === '$$undefined$$')
    return undefined;

  return val;
}

function stringReplace(val) {
  if (val === null)
    return '$$null$$';

  if (typeof val === 'undefined')
    return '$$undefined$$';

  return val;
}

// returns true if object passes
function recursiveOneWayDiff(left, right) {
  if (left instanceof Array)
  {
    if (!(right instanceof Array))
      return false;

    for (var i = 0; i < left.length; i++)
    {
      if (typeof left[i] === 'undefined' && typeof right[i] === 'undefined')
        continue;
      else if (typeof left[i] !== 'undefined' && typeof right[i] === 'undefined')
        return false;
      else if (!isPOJS(left[i])) {
        if (!propDiff(left[i], right[i])) {
          return false;
        }
      }
      else if (!isPOJS(right[i]))
        return false;
      else if (!recursiveOneWayDiff(left[i], right[i]))
        return false;
    }
  }
  else
  {
    if (typeof right !== 'object')
      return false;

    for (var prop in left)
    {
      if (typeof left[prop] === 'undefined' && typeof right[prop] === 'undefined')
        continue;
      else if (!(prop in right))
        return false;
      else if (!isPOJS(left[prop])) {
        if (!propDiff(left[prop], right[prop])) {
          return false;
        }
      }
      else if (!isPOJS(right[prop]))
        return false;
      else if (!recursiveOneWayDiff(left[prop], right[prop]))
        return false;
    }
  }

  return true;
}

function isPOJS(prop) {
  return !(
    prop instanceof Date ||
    prop instanceof RegExp ||
    prop instanceof String ||
    prop instanceof Number) &&
    typeof prop === 'object';
}

// returns true if non-obj props are equal
function propDiff(left, right) {
  if (isNaN(left) && isNaN(right) && typeof left === 'number' && typeof right === 'number')
    return true;
  else if (left === right)
    return true;
  else if (left.toString() === right.toString())
      return true;

  return false;
}

function itr(left, right, indexOrProp) {
  if (left[indexOrProp] instanceof Array) {
    if (right[indexOrProp] instanceof Array)
      assign(left[indexOrProp], right[indexOrProp]);
    else
      assign(left[indexOrProp], right[indexOrProp] = []);
  }
  else if (isPOJS(left[indexOrProp])) {
    if (isPOJS(right[indexOrProp]))
      assign(left[indexOrProp], right[indexOrProp]);
    else
      assign(left[indexOrProp], right[indexOrProp] = {});
  }
  else if (left[indexOrProp] !== null && typeof left[indexOrProp] !== 'undefined')
    right[indexOrProp] = unStringReplace(left[indexOrProp]);
}

// recursively assigns left to right
function assign(left, right) {
  if (left instanceof Array)
    left.forEach(function(item, index) {
      itr(left, right, index);
    });
  else {
    for (var prop in left) {
      itr(left, right, prop);
    }
  }
  return right;
}

var messageHandler = {
  'event-open': function(conn, message) {
    conn.sendObj('data-update-state', {'state': State});
  },
  'data-attempt-state': function(conn, message) {
    var lastAttempt;
    message.attempts.some(function(attempt) {
      if (recursiveOneWayDiff(attempt.diff, State)) {
        lastAttempt = attempt.id;
        assign(attempt.patch, State);
        return false;
      }
      else
        return true;
    });
    if (typeof lastAttempt !== 'undefined')
      conns.forEach(function(otherConn) {
        if (otherConn != conn)
          otherConn.sendObj('data-update-state', {'state': State});
      });
    conn.sendObj('data-attempts-returned', {'lastAttempt': lastAttempt, 'state': State});
  }
};

var conns = [];
var id = 0;
WebSocketServer.on('connection', function(conn) {
  conn.id = id++;
  conn.sendObj = function(channel, message) {
    conn.send(JSON.stringify({'channel': channel, 'message': message}));
  };
  conns.push(conn);

  conn.on('message', function(json) {
    var envelope = JSON.parse(json);
    if (envelope.channel in messageHandler)
      messageHandler[envelope.channel](conn, envelope.message);
  });

  conn.on('close', function() {
    conns.splice(conns.map(function(conn) { return conn.id; }).indexOf(conn.id), 1);
  });

  conn.sendObj('data-update-state', {'state': State});

});
