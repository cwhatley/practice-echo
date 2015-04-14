'use strict';

var connect = require('connect');
var serveStatic = require('serve-static');
var path = require('path');
var dir = path.resolve(__dirname, './public/');
console.log('root is', dir);
connect().use(serveStatic(dir)).listen(process.env.PORT || 8080);
