const express = require('express');
const app = express();
app.use(express.json()); // para receber JSON

// Rota de teste
app.get('/test', (req, res) => {
  res.send('Servidor OK!');
});

// Outra rota que acede à base de dados
app.get('/users', async (req, res) => {
  const [rows] = await db.query('SELECT * FROM users');
  res.json(rows);
});

const server = app.listen(3000, () => {
  console.log('🚀 Servidor a correr em http://localhost:3000');
});