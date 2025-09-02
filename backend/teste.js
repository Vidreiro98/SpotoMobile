// test-server.js
const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('OK'));

app.listen(3001, () => console.log('Servidor OK'));
