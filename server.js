const express = require('express');
const morgan = require('morgan');
const directory = require('serve-index');
const log = require('fancy-log');

var app = express();

app.use(morgan('dev'));

app.use(express.static('docs'));

app.use(directory('docs', { 'icons': true }));

app.listen(process.env.PORT || 8000, () => log('Listening on http://127.0.0.1:8000'));
