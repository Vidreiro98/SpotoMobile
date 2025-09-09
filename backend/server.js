const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql2');
const session = require('express-session');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3001;const server = http.createServer(app);
const multer = require('multer');
const { requireAuth, requireRole } = require('./auth');
require("dotenv").config();
const db = pool;

console.log(path.join(__dirname, '../frontend/public/index.html'));
// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  key: 'user_id',
  secret: 'segredo123',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 15 // 15 dias
  }
}));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // pasta no backend
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

app.use(express.static(path.join(__dirname, '../frontend/public')));


// no topo do arquivo

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
}).promise();


// API de spaces
app.get('/api/spaces', async (req, res) => {
  try {
   const [spaces] = await db.query(
  `SELECT s.*, u.name AS owner_name
   FROM spaces s
   JOIN users u ON s.owner_id = u.id`
);
const spaceIds = spaces.map(s => s.id);

const [photos] = await db.query(
  'SELECT space_id, file_path FROM space_photos WHERE space_id IN (?)',
  [spaceIds]
);

const [caeCodes] = await db.query(
  `SELECT sc.space_id, cc.code, cc.description
   FROM space_cae sc
   JOIN cae_codes cc ON sc.cae_id = cc.id
   WHERE sc.space_id IN (?)`,
  [spaceIds]
);

    const formatted = spaces.map(space => ({
      id: space.id,
      name: space.title,
      description: space.description,
      location: space.location,
      longitude: space.longitude,
      latitude: space.latitude,
      price: space.price_per_hour,
      owner_id: space.owner_id,
      owner_name: space.owner_name ,
      is_active: space.is_active,
      created_at: space.created_at,
      photo_urls: photos
        .filter(p => p.space_id === space.id)
        .map(p => `/uploads/${p.file_path}`), // <--- atenção ao path
      cae_codes: caeCodes
        .filter(c => c.space_id === space.id)
        .map(c => ({ code: c.code, description: c.description }))
    }));

    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao obter espaços' });
  }
});

// 🚨 NOVO ENDPOINT
app.get('/api/spaces/:id', async (req, res) => {
  try {
    const spaceId = req.params.id;

    const [spaces] = await db.query(
      `SELECT s.*, u.name AS owner_name
       FROM spaces s
       JOIN users u ON s.owner_id = u.id
       WHERE s.id = ?`, // <--- filtramos só pelo ID
      [spaceId]
    );

    if (spaces.length === 0) {
      return res.status(404).json({ error: 'Espaço não encontrado' });
    }

    const [photos] = await db.query(
      'SELECT file_path FROM space_photos WHERE space_id = ?',
      [spaceId]
    );

    const [caeCodes] = await db.query(
      `SELECT cc.code, cc.description
       FROM space_cae sc
       JOIN cae_codes cc ON sc.cae_id = cc.id
       WHERE sc.space_id = ?`,
      [spaceId]
    );

    const space = spaces[0];

    const formatted = {
      id: space.id,
      name: space.title,
      description: space.description,
      location: space.location,
      longitude: space.longitude,
      latitude: space.latitude,
      price: space.price_per_hour,
      owner_id: space.owner_id,
      owner_name: space.owner_name,
      is_active: space.is_active,
      created_at: space.created_at,
      photo_urls: photos.map(p => `/uploads/${p.file_path}`),
      cae_codes: caeCodes.map(c => ({
        code: c.code,
        description: c.description
      }))
    };

    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao obter espaço único' });
  }
});

// Criar novo espaço
app.post('/api/spaces', upload.array('images', 5), async (req, res) => {
  try {
    const { title, description, location, price_per_hour, is_active, caes } = req.body;
    if (!req.session.user) {
    return res.status(401).json({ error: 'Necessário estar logado para criar um espaço.' });
  }

  const owner_id = req.session.user.id;

    if (!title || !description || !location || !price_per_hour) {
      return res.status(400).json({ error: 'Campos obrigatórios em falta.' });
    }

    // Criar o espaço
    const [result] = await db.query(
  `INSERT INTO spaces (owner_id, title, description, location, price_per_hour, is_active, created_at)
   VALUES (?, ?, ?, ?, ?, ?, NOW())`,
  [owner_id, title, description, location, price_per_hour, is_active ?? 1]
);

    const spaceId = result.insertId;

    // Guardar fotos na tabela space_photos
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await db.query(
          `INSERT INTO space_photos (space_id, file_path, is_cover, uploaded_at)
           VALUES (?, ?, ?, NOW())`,
          [spaceId, file.filename, 0]
        );
      }
    }

    // Guardar CAEs selecionados
    if (caes) {
      const caeIds = JSON.parse(caes);
      for (const caeId of caeIds) {
        await db.query(
          `INSERT INTO space_cae (space_id, cae_id) VALUES (?, ?)`,
          [spaceId, caeId]
        );
      }
    }

    res.status(201).json({
      message: 'Espaço criado com sucesso!',
      spaceId,
      uploaded: req.files.map(f => f.filename)
    });
  } catch (err) {
    console.error('Erro ao criar espaço:', err);
    res.status(500).json({ error: 'Erro interno ao criar espaço.' });
  }
});


// List CAEs
app.get('/api/cae-codes', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, code, description FROM cae_codes'
    );
    res.json(rows);
  } catch (err) {
    console.error('Erro ao obter CAEs:', err);
    res.status(500).json({ error: 'Erro ao obter lista de CAEs.' });
  }
});

// Atualizar espaço existente
app.put('/api/spaces/:id', upload.array('images', 5), async (req, res) => {
  try {
    const spaceId = req.params.id;
    const { title, description, location, price_per_hour, is_active, caes } = req.body;

    if (!req.session.user) {
      return res.status(401).json({ error: 'Necessário estar logado para editar um espaço.' });
    }

    // Verifica se o utilizador é dono do espaço (ou admin)
    const [rows] = await db.query('SELECT owner_id FROM spaces WHERE id = ?', [spaceId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Espaço não encontrado.' });
    }
    if (rows[0].owner_id !== req.session.user.id && req.session.user.role !== 'admin') {
      return res.status(403).json({ error: 'Sem permissão para editar este espaço.' });
    }

    // Atualiza os campos principais
    await db.query(
      `UPDATE spaces 
       SET title = ?, description = ?, location = ?, price_per_hour = ?, is_active = ? 
       WHERE id = ?`,
      [title, description, location, price_per_hour, is_active ?? 1, spaceId]
    );

    // Se forem enviadas novas fotos, insere na tabela
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await db.query(
          `INSERT INTO space_photos (space_id, file_path, is_cover, uploaded_at)
           VALUES (?, ?, ?, NOW())`,
          [spaceId, file.filename, 0]
        );
      }
    }

    // Atualiza CAEs (podes apagar os antigos e inserir os novos)
    if (caes) {
      const caeIds = JSON.parse(caes);
      await db.query('DELETE FROM space_cae WHERE space_id = ?', [spaceId]);
      for (const caeId of caeIds) {
        await db.query(
          `INSERT INTO space_cae (space_id, cae_id) VALUES (?, ?)`,
          [spaceId, caeId]
        );
      }
    }

    res.json({ message: 'Espaço atualizado com sucesso!' });
  } catch (err) {
    console.error('Erro ao atualizar espaço:', err);
    res.status(500).json({ error: 'Erro interno ao atualizar espaço.' });
  }
});



// Login
app.post('/login', async (req, res) => {
    console.log('Tentativa de login:', req.body);
    const { name, password } = req.body;

    try {
        // Consulta o utilizador usando a versão de promessas
        const [results] = await db.query('SELECT * FROM users WHERE name = ?', [name]);

        // Verifica se o utilizador foi encontrado
        if (results.length === 0) {
            return res.status(401).send({ message: 'Utilizador não encontrado.' });
        }

        const user = results[0];
        const hash = user.password_hash;

        // Compara a password usando a promessa de bcrypt
        const passwordMatch = await bcrypt.compare(password, hash);

        if (passwordMatch) {
            // Login com sucesso, define a sessão
            req.session.user = {
                id: user.id,
                name: user.name,
                role: user.role,
                // Adiciona outras propriedades do utilizador que precisares
            };
            res.send({
                message: 'Login realizado com sucesso!',
                name: user.name,
                role: user.role
            });
        } else {
            // Password incorreta
            res.status(401).send({ message: 'Password incorreta!' });
        }

    } catch (err) {
        // Captura e loga qualquer erro interno
        console.error('Erro no login:', err);
        res.status(500).send({ message: 'Erro interno do servidor.' });
    }
});

// Sessão - devolve o utilizador autenticado
app.get('/api/user/me', (req, res) => {
  if (req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.status(401).json({ loggedIn: false });
  }
});

// Logout
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).send({ message: 'Erro ao terminar sessão.' });
    res.clearCookie('user_id');
    return res.send({ message: 'Sessão terminada com sucesso.' });
  });
});

// WebSockets
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  }
});

const userSockets = {}; // Mapeia userId para socket.id

io.on("connection", (socket) => {
    console.log("🟢 Novo cliente ligado:", socket.id);

    // Ouve o evento para guardar o socket do utilizador
    socket.on("join_chat", (data) => {
        const userId = data.userId;
        userSockets[userId] = socket.id;
        console.log(`Utilizador ${userId} juntou-se ao chat.`);
    });

    // Ouve o evento para enviar e guardar a mensagem
    socket.on("send_message", async (data) => {
        const { sender_id, receiver_id, content } = data;
        
        // 1. Salva a mensagem na base de dados
        try {
            await db.query(
                'INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)',
                [sender_id, receiver_id, content]
            );
        } catch (err) {
            console.error("Erro ao salvar a mensagem:", err);
            // Não envia a mensagem se não a conseguir guardar
            return;
        }

        // 2. Emite a mensagem em tempo real para o recetor (se estiver online)
        const receiverSocketId = userSockets[receiver_id];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("receive_message", data);
        }

        // 3. Emite a mensagem para o próprio remetente (para o chat ser atualizado)
        io.to(userSockets[sender_id]).emit("receive_message", data);
    });

    socket.on("disconnect", () => {
        // Remove o socket do utilizador do mapa quando ele se desconecta
        for (const userId in userSockets) {
            if (userSockets[userId] === socket.id) {
                delete userSockets[userId];
                console.log(`Utilizador ${userId} saiu do chat.`);
                break;
            }
        }
        console.log("🔴 Cliente desligado:", socket.id);
    });
});

app.get('/api/search-users', async (req, res) => {
    // 1. Verifica se o utilizador está autenticado
    if (!req.session.user) {
        return res.status(401).json({ message: 'Não autenticado.' });
    }
    
    // 2. Constrói o termo de pesquisa de forma segura
    const searchTerm = `%${req.query.query}%`;
    
    try {
        // 3. Executa a query para encontrar utilizadores com nomes parecidos
        const [users] = await db.query(
            'SELECT id, name FROM users WHERE name LIKE ? AND id != ?',
            [searchTerm, req.session.user.id] // Exclui o próprio utilizador
        );
        
        // 4. Devolve a lista de utilizadores encontrados
        res.json(users);
    } catch (err) {
        console.error('Erro na pesquisa de utilizadores:', err);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

app.get('/api/friends-and-chats', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ message: 'Não autenticado.' });
    const currentUserId = req.session.user.id;

    try {
        const [friends] = await db.query(`
            SELECT u.id, u.name,
                (SELECT content FROM messages
                 WHERE (sender_id = ? AND receiver_id = u.id)
                    OR (sender_id = u.id AND receiver_id = ?)
                 ORDER BY created_at DESC LIMIT 1) AS last_message,
                (SELECT created_at FROM messages
                 WHERE (sender_id = ? AND receiver_id = u.id)
                    OR (sender_id = u.id AND receiver_id = ?)
                 ORDER BY created_at DESC LIMIT 1) AS last_message_at
            FROM users u
            WHERE u.id IN (
                SELECT DISTINCT CASE 
                    WHEN sender_id = ? THEN receiver_id 
                    ELSE sender_id 
                END AS friend_id
                FROM messages
                WHERE sender_id = ? OR receiver_id = ?
            )
            ORDER BY last_message_at DESC;
        `, [currentUserId, currentUserId, currentUserId, currentUserId, currentUserId, currentUserId, currentUserId]);

        res.json(friends);
    } catch (err) {
        console.error('Erro ao obter amigos e conversas:', err);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});


app.get('/api/messages/:friendId', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: 'Não autenticado.' });
    }
    
    const currentUserId = req.session.user.id;
    const friendId = req.params.friendId;

    try {
        const [messages] = await db.query(
            `SELECT * FROM messages 
             WHERE (sender_id = ? AND receiver_id = ?) 
             OR (sender_id = ? AND receiver_id = ?)
             ORDER BY created_at ASC`,
            [currentUserId, friendId, friendId, currentUserId]
        );
        res.json(messages);
    } catch (err) {
        console.error('Erro ao obter mensagens:', err);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});


app.post('/upload', upload.array('photos', 10), (req, res) => {
    res.json({
        message: 'Arquivos enviados com sucesso!',
        files: req.files
    });
});

// GET blocked dates para um space (adiciona isto)
app.get('/api/blocked-dates/:spaceId', async (req, res) => {
  try {
    const spaceId = req.params.spaceId;
    const [rows] = await db.query(
      'SELECT id, space_id, start_datetime, end_datetime, reason, created_by, created_at FROM blocked_dates WHERE space_id = ? ORDER BY start_datetime',
      [spaceId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Erro ao obter blocked dates:', err);
    res.status(500).json({ error: 'Erro interno ao obter blocked dates.' });
  }
});

// Adicionar uma nova data bloqueada
app.post('/api/blocked-dates', requireRole(['admin', 'owner']), async (req, res) => {
    try {
        const { space_id, start_datetime, end_datetime, reason } = req.body;
        const created_by = req.session.user.id; // Assume que o utilizador autenticado cria o bloqueio

        // Validação básica dos dados
        if (!space_id || !start_datetime || !end_datetime) {
            return res.status(400).json({ error: 'Os campos space_id, start_datetime e end_datetime são obrigatórios.' });
        }

        // A query de inserção usa prepared statements para segurança
        const [result] = await db.query(
            `INSERT INTO blocked_dates (space_id, start_datetime, end_datetime, reason, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [space_id, start_datetime, end_datetime, reason, created_by]
        );

        res.status(201).json({
            message: 'Data bloqueada adicionada com sucesso!',
            id: result.insertId
        });
    } catch (err) {
        console.error('Erro ao adicionar data bloqueada:', err);
        res.status(500).json({ error: 'Erro interno ao adicionar a data bloqueada.' });
    }
});
app.post('/api/blocked-dates/batch', requireRole(['admin','owner']), async (req, res) => {
  try {
    const { space_id, dates } = req.body;
    if (!space_id || !Array.isArray(dates)) {
      return res.status(400).json({ error: 'Enviar { space_id, dates: [ {start_datetime,end_datetime,reason}, ...] }' });
    }

    // obter ligação do pool
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const insertSql = `INSERT INTO blocked_dates (space_id, start_datetime, end_datetime, reason, created_by, created_at)
                         VALUES (?, ?, ?, ?, ?, NOW())`;

      const createdBy = req.session && req.session.user ? req.session.user.id : null;

      for (const d of dates) {
        // validação básica por item
        if (!d.start_datetime || !d.end_datetime) {
          await conn.rollback();
          return res.status(400).json({ error: 'Cada item deve ter start_datetime e end_datetime' });
        }
        await conn.query(insertSql, [space_id, d.start_datetime, d.end_datetime, d.reason || '', createdBy]);
      }

      await conn.commit();
      return res.status(201).json({ success: true, inserted: dates.length });
    } catch (err) {
      await conn.rollback();
      console.error('Erro na transacção batch blocked-dates:', err);
      return res.status(500).json({ error: 'Erro ao inserir blocked dates (transaction failed).' });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Erro no endpoint batch:', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});
// Eliminar uma data bloqueada pelo ID
app.delete('/api/blocked-dates/:id', requireRole(['admin', 'owner']), async (req, res) => {
    try {
        const { id } = req.params;
        const currentUserId = req.session.user.id;
        const currentUserRole = req.session.user.role;

        // Verifica se a data existe e se o utilizador tem permissão para a eliminar
        const [dates] = await db.query('SELECT created_by FROM blocked_dates WHERE id = ?', [id]);
        
        if (dates.length === 0) {
            return res.status(404).json({ error: 'Data bloqueada não encontrada.' });
        }

        const date = dates[0];
        
        // Permite a eliminação apenas se o utilizador for admin ou se ele próprio a criou
        if (currentUserRole !== 'admin' && date.created_by !== currentUserId) {
             return res.status(403).json({ error: 'Sem permissão para eliminar esta data.' });
        }
        
        // Query de exclusão
        await db.query('DELETE FROM blocked_dates WHERE id = ?', [id]);

        res.status(200).json({ message: 'Data bloqueada eliminada com sucesso.' });
    } catch (err) {
        console.error('Erro ao eliminar a data bloqueada:', err);
        res.status(500).json({ error: 'Erro interno ao eliminar a data bloqueada.' });
    }
});

// Apenas utilizadores autenticados
app.get('/user', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/dashboard.html'));
});

// Apenas admin ou owner
app.get('/upload', requireRole(['admin', 'owner']), (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/protected/upload.html'));
});

app.get('/dashboard', requireRole(['admin', 'owner']), (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/protected/dashboard.html'));
});

// Apenas moderadores
app.get('/mod', requireRole(['moderador']), (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/moderacao.html'));
});


// Servir arquivos estáticos (para pré-visualização depois)
app.use('/uploads', express.static('uploads'));


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});



// Iniciar servidor
server.listen(PORT, () => {
  console.log(`🚀 Servidor a correr na porta ${PORT}`);
});


