const path = require('path');
const Module = require('module');

// Packaged Electron strips node_modules; deps live next to src/
const deps = path.join(__dirname, '..', 'deps');
const parts = [deps];
if (process.env.NODE_PATH) parts.push(process.env.NODE_PATH);
process.env.NODE_PATH = parts.join(path.delimiter);
Module._initPaths();

require('./index.js');
