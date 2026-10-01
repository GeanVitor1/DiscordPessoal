import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import db from './db.js';
import { runMigrations } from './migrations/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT']
  }
});

app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Diretório de uploads
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Configuração do Multer com limite de tamanho estrito (10MB)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Cache e controle de sessões ativas em memória para signaling
let activeUsers = {}; // socketId -> user info
let voiceRooms = {}; // channelId -> array de participantes

// --- Rota de Health Check Segura (Sem vazar senhas ou connection strings) ---
app.get('/api/health', async (req, res) => {
  const isDbHealthy = await db.healthCheck();
  const socketHealthy = !!io;

  const allHealthy = isDbHealthy && socketHealthy;

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ok' : 'degraded',
    database: isDbHealthy ? 'ok' : 'error',
    socket: socketHealthy ? 'ok' : 'error'
  });
});

// --- Rotas de Upload ---
app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Arquivo excede o limite máximo permitido de 10MB!' });
      }
      return res.status(500).json({ error: 'Erro ao fazer upload do arquivo' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({
      url: fileUrl,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });
  });
});

// --- Rotas de Usuário & Perfil ---
app.post('/api/users/sync', async (req, res) => {
  const { id, username, discriminator, avatar, banner, banner_color, bio, status, custom_status } = req.body;
  if (!id) return res.status(400).json({ error: 'ID de usuário obrigatório' });

  try {
    const existing = await db.queryOne('SELECT * FROM users WHERE id = $1', [id]);
    if (!existing) {
      await db.query(`
        INSERT INTO users (id, username, discriminator, avatar, banner, banner_color, bio, status, custom_status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [id, username, discriminator || 1000, avatar || '', banner || '', banner_color || '#5865F2', bio || '', status || 'online', custom_status || '']);
    } else {
      await db.query(`
        UPDATE users SET 
          username = COALESCE($1, username),
          avatar = COALESCE($2, avatar),
          banner = COALESCE($3, banner),
          banner_color = COALESCE($4, banner_color),
          bio = COALESCE($5, bio),
          status = COALESCE($6, status),
          custom_status = COALESCE($7, custom_status)
        WHERE id = $8
      `, [username, avatar, banner, banner_color, bio, status, custom_status, id]);
    }

    const updatedUser = await db.queryOne('SELECT * FROM users WHERE id = $1', [id]);
    res.json(updatedUser);
  } catch (err) {
    console.error('Erro ao sincronizar usuário:', err);
    res.status(500).json({ error: 'Erro interno ao sincronizar usuário' });
  }
});

// --- Rotas de Servidores ---
app.get('/api/servers', async (req, res) => {
  try {
    const serverRows = await db.query('SELECT * FROM servers ORDER BY created_at ASC');
    const fullServers = [];

    for (const s of serverRows) {
      const channels = await db.query('SELECT * FROM channels WHERE server_id = $1 ORDER BY id ASC', [s.id]);
      fullServers.push({
        ...s,
        channels
      });
    }

    res.json(fullServers);
  } catch (err) {
    console.error('Erro ao buscar servidores:', err);
    res.status(500).json({ error: 'Erro ao listar servidores' });
  }
});

app.post('/api/servers', async (req, res) => {
  const { name, icon, banner, ownerId } = req.body;
  const serverId = 'srv-' + Date.now();
  const effectiveOwner = ownerId || 'clyde-bot';

  try {
    await db.query(
      'INSERT INTO servers (id, name, icon, banner, owner_id) VALUES ($1, $2, $3, $4, $5)',
      [serverId, name || 'Novo Servidor', icon || '🌟', banner || '', effectiveOwner]
    );

    const generalTextId = 'c-' + Date.now();
    const generalVoiceId = 'v-' + Date.now();

    await db.query(
      'INSERT INTO channels (id, server_id, name, type, topic) VALUES ($1, $2, $3, $4, $5)',
      [generalTextId, serverId, 'geral', 'text', 'Canal inicial']
    );
    await db.query(
      'INSERT INTO channels (id, server_id, name, type, topic) VALUES ($1, $2, $3, $4, $5)',
      [generalVoiceId, serverId, 'Geral (Voz)', 'voice', '']
    );

    const newServer = {
      id: serverId,
      name: name || 'Novo Servidor',
      icon: icon || '🌟',
      banner: banner || '',
      owner_id: effectiveOwner,
      channels: [
        { id: generalTextId, server_id: serverId, name: 'geral', type: 'text', topic: 'Canal inicial' },
        { id: generalVoiceId, server_id: serverId, name: 'Geral (Voz)', type: 'voice', topic: '' }
      ]
    };

    io.emit('server_created', newServer);
    res.json(newServer);
  } catch (err) {
    console.error('Erro ao criar servidor:', err);
    res.status(500).json({ error: 'Erro ao criar servidor' });
  }
});

app.put('/api/servers/:serverId', async (req, res) => {
  const { serverId } = req.params;
  const { name, icon, banner } = req.body;

  try {
    const existing = await db.queryOne('SELECT * FROM servers WHERE id = $1', [serverId]);
    if (!existing) {
      return res.status(404).json({ error: 'Servidor não encontrado' });
    }

    await db.query(`
      UPDATE servers SET
        name = COALESCE($1, name),
        icon = COALESCE($2, icon),
        banner = COALESCE($3, banner),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `, [name, icon, banner, serverId]);

    const updatedServer = await db.queryOne('SELECT * FROM servers WHERE id = $1', [serverId]);
    const channels = await db.query('SELECT * FROM channels WHERE server_id = $1', [serverId]);
    const fullServer = { ...updatedServer, channels };

    io.emit('server_updated', fullServer);
    res.json(fullServer);
  } catch (err) {
    console.error('Erro ao atualizar servidor:', err);
    res.status(500).json({ error: 'Erro ao atualizar servidor' });
  }
});

// --- Rotas de Canais ---
app.post('/api/servers/:serverId/channels', async (req, res) => {
  const { serverId } = req.params;
  const { name, type, topic } = req.body;

  const chId = (type === 'voice' ? 'v-' : 'c-') + Date.now();
  const cleanName = (name || 'canal').toLowerCase().replace(/\s+/g, '-');

  try {
    await db.query(
      'INSERT INTO channels (id, server_id, name, type, topic) VALUES ($1, $2, $3, $4, $5)',
      [chId, serverId, cleanName, type || 'text', topic || '']
    );

    const newChannel = { id: chId, server_id: serverId, name: cleanName, type: type || 'text', topic: topic || '' };
    io.emit('channel_created', { serverId, channel: newChannel });
    res.json(newChannel);
  } catch (err) {
    console.error('Erro ao criar canal:', err);
    res.status(500).json({ error: 'Erro ao criar canal' });
  }
});

// --- Rotas de Mensagens ---
app.get('/api/channels/:channelId/messages', async (req, res) => {
  const { channelId } = req.params;

  try {
    const messages = await db.query(`
      SELECT m.*, u.username, u.discriminator, u.avatar, u.banner, u.banner_color, u.bio, u.custom_status, u.status
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.id
      WHERE m.channel_id = $1
      ORDER BY m.timestamp ASC
      LIMIT 100
    `, [channelId]);

    const formatted = messages.map(m => ({
      id: m.id,
      channelId: m.channel_id,
      content: m.content,
      attachment: m.attachment ? (typeof m.attachment === 'string' ? JSON.parse(m.attachment) : m.attachment) : null,
      timestamp: m.timestamp,
      sender: {
        id: m.sender_id,
        username: m.username || 'Membro',
        discriminator: m.discriminator || 1000,
        avatar: m.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=user',
        banner: m.banner || '',
        bannerColor: m.banner_color || '#5865F2',
        bio: m.bio || '',
        customStatus: m.custom_status || '',
        status: m.status || 'offline'
      }
    }));

    res.json(formatted);
  } catch (err) {
    console.error('Erro ao buscar mensagens:', err);
    res.status(500).json({ error: 'Erro ao buscar histórico de mensagens' });
  }
});

// --- Rota de Configuração ICE com Geração de Credenciais Temporárias TURN (RFC 5766) ---
app.get('/api/ice-servers', (req, res) => {
  const stunServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ];

  const iceServers = [...stunServers];

  const turnSecret = process.env.TURN_SECRET;
  const turnHost = process.env.TURN_SERVER_HOST; // ex: turn.meudominio.com ou IP da VPS
  const turnPort = process.env.TURN_PORT || 3478;

  if (turnSecret && turnHost) {
    // 24 horas de validade para a credencial temporária
    const ttlSeconds = 24 * 3600;
    const expiryTime = Math.floor(Date.now() / 1000) + ttlSeconds;
    const username = `${expiryTime}:client_user`;

    // HMAC-SHA1 padronizado para coturn
    const hmac = crypto.createHmac('sha1', turnSecret);
    hmac.setEncoding('base64');
    hmac.write(username);
    hmac.end();
    const credential = hmac.read();

    iceServers.push({
      urls: [
        `turn:${turnHost}:${turnPort}?transport=udp`,
        `turn:${turnHost}:${turnPort}?transport=tcp`
      ],
      username,
      credential
    });
  } else if (process.env.TURN_SERVER_URL && process.env.TURN_USERNAME) {
    // Fallback para credenciais estáticas se definidas
    iceServers.push({
      urls: process.env.TURN_SERVER_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL || ''
    });
  }

  res.json({ iceServers });
});

// --- Socket.io: Tempo Real, Presença & WebRTC ---
io.on('connection', (socket) => {
  socket.on('user_join', async (userData) => {
    if (!userData || !userData.id) return;

    try {
      const existing = await db.queryOne('SELECT id FROM users WHERE id = $1', [userData.id]);
      if (!existing) {
        await db.query(`
          INSERT INTO users (id, username, discriminator, avatar, banner, banner_color, bio, status, custom_status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          userData.id,
          userData.username,
          userData.discriminator || 1000,
          userData.avatar || '',
          userData.banner || '',
          userData.banner_color || '#5865F2',
          userData.bio || '',
          userData.status || 'online',
          userData.custom_status || ''
        ]);
      } else {
        await db.query(`
          UPDATE users SET
            username = COALESCE($1, username),
            avatar = COALESCE($2, avatar),
            status = COALESCE($3, status),
            custom_status = COALESCE($4, custom_status)
          WHERE id = $5
        `, [userData.username, userData.avatar, userData.status, userData.custom_status, userData.id]);
      }
    } catch (e) {
      console.error('Erro ao atualizar usuário via socket:', e.message);
    }

    activeUsers[socket.id] = {
      ...userData,
      socketId: socket.id,
      status: userData.status || 'online'
    };

    io.emit('users_update', Object.values(activeUsers));
    io.emit('voice_state_update', voiceRooms);
  });

  socket.on('status_change', async (status) => {
    if (activeUsers[socket.id]) {
      activeUsers[socket.id].status = status;
      try {
        await db.query('UPDATE users SET status = $1 WHERE id = $2', [status, activeUsers[socket.id].id]);
      } catch (e) { }
      io.emit('users_update', Object.values(activeUsers));
    }
  });

  socket.on('send_message', async ({ channelId, content, attachment }) => {
    const user = activeUsers[socket.id] || {
      id: 'usr-unknown',
      username: 'Membro',
      avatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=user',
      status: 'online'
    };

    const msgId = 'msg-' + Date.now() + '-' + Math.round(Math.random() * 1000);
    const timestamp = new Date().toISOString();

    try {
      await db.query(`
        INSERT INTO messages (id, channel_id, sender_id, content, attachment, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [msgId, channelId, user.id, content || '', attachment ? JSON.stringify(attachment) : null, timestamp]);
    } catch (e) {
      console.error('Erro ao salvar mensagem no DB:', e.message);
    }

    const messageObj = {
      id: msgId,
      channelId,
      sender: user,
      content,
      attachment: attachment || null,
      timestamp
    };

    io.emit('new_message', messageObj);
  });

  socket.on('typing_start', ({ channelId }) => {
    const user = activeUsers[socket.id];
    if (user) socket.broadcast.emit('user_typing', { channelId, user });
  });

  socket.on('typing_stop', ({ channelId }) => {
    const user = activeUsers[socket.id];
    if (user) socket.broadcast.emit('user_stop_typing', { channelId, userId: user.id });
  });

  // Canais de voz e signaling
  socket.on('join_voice_channel', ({ channelId }) => {
    const user = activeUsers[socket.id] || { id: socket.id, username: 'Usuário', avatar: '' };
    if (!voiceRooms[channelId]) voiceRooms[channelId] = [];

    voiceRooms[channelId] = voiceRooms[channelId].filter(p => p.socketId !== socket.id);
    const existingUsers = [...voiceRooms[channelId]];

    voiceRooms[channelId].push({
      socketId: socket.id,
      user,
      isMuted: false,
      isDeafened: false,
      isSpeaking: false,
      isScreenSharing: false,
      isCameraOn: false
    });

    socket.join(`voice_${channelId}`);
    socket.emit('voice_room_users', { channelId, users: existingUsers });
    socket.to(`voice_${channelId}`).emit('user_joined_voice', { channelId, socketId: socket.id, user });
    io.emit('voice_state_update', voiceRooms);
  });

  socket.on('leave_voice_channel', () => {
    for (const chId in voiceRooms) {
      const idx = voiceRooms[chId].findIndex(p => p.socketId === socket.id);
      if (idx !== -1) {
        const participant = voiceRooms[chId][idx];
        if (participant.isScreenSharing) {
          socket.to(`voice_${chId}`).emit('screen_share_stopped', {
            channelId: chId,
            sharerSocketId: socket.id,
            user: participant.user
          });
        }
        socket.leave(`voice_${chId}`);
        socket.to(`voice_${chId}`).emit('user_left_voice', { channelId: chId, socketId: socket.id });
        voiceRooms[chId].splice(idx, 1);
        if (voiceRooms[chId].length === 0) delete voiceRooms[chId];
      }
    }
    io.emit('voice_state_update', voiceRooms);
  });

  socket.on('voice_offer', ({ targetSocketId, sdp }) => {
    io.to(targetSocketId).emit('voice_offer', { fromSocketId: socket.id, sdp });
  });

  socket.on('voice_answer', ({ targetSocketId, sdp }) => {
    io.to(targetSocketId).emit('voice_answer', { fromSocketId: socket.id, sdp });
  });

  socket.on('ice_candidate', ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit('ice_candidate', { fromSocketId: socket.id, candidate });
  });

  socket.on('voice_speaking', ({ channelId, isSpeaking }) => {
    if (voiceRooms[channelId]) {
      const p = voiceRooms[channelId].find(u => u.socketId === socket.id);
      if (p) {
        p.isSpeaking = isSpeaking;
        io.to(`voice_${channelId}`).emit('participant_speaking', { socketId: socket.id, isSpeaking });
      }
    }
  });

  socket.on('voice_state_toggle', ({ channelId, isMuted, isDeafened, isScreenSharing, isCameraOn }) => {
    if (voiceRooms[channelId]) {
      const p = voiceRooms[channelId].find(u => u.socketId === socket.id);
      if (p) {
        if (isMuted !== undefined) p.isMuted = isMuted;
        if (isDeafened !== undefined) p.isDeafened = isDeafened;
        if (isCameraOn !== undefined) p.isCameraOn = isCameraOn;

        if (isScreenSharing !== undefined && p.isScreenSharing !== isScreenSharing) {
          p.isScreenSharing = isScreenSharing;
          if (isScreenSharing) {
            io.to(`voice_${channelId}`).emit('screen_share_started', {
              channelId,
              sharerSocketId: socket.id,
              user: p.user
            });
          } else {
            io.to(`voice_${channelId}`).emit('screen_share_stopped', {
              channelId,
              sharerSocketId: socket.id,
              user: p.user
            });
          }
        }
        io.emit('voice_state_update', voiceRooms);
      }
    }
  });

  // WebRTC Screen Share Signaling
  socket.on('screen_request_view', ({ targetSocketId, channelId }) => {
    io.to(targetSocketId).emit('screen_request_view', {
      viewerSocketId: socket.id,
      viewerUser: activeUsers[socket.id],
      channelId
    });
  });

  socket.on('screen_offer', ({ targetSocketId, channelId, sdp }) => {
    io.to(targetSocketId).emit('screen_offer', {
      sharerSocketId: socket.id,
      channelId,
      sdp
    });
  });

  socket.on('screen_answer', ({ targetSocketId, channelId, sdp }) => {
    io.to(targetSocketId).emit('screen_answer', {
      viewerSocketId: socket.id,
      channelId,
      sdp
    });
  });

  socket.on('screen_ice_candidate', ({ targetSocketId, channelId, candidate }) => {
    io.to(targetSocketId).emit('screen_ice_candidate', {
      fromSocketId: socket.id,
      channelId,
      candidate
    });
  });

  socket.on('screen_stop_viewing', ({ targetSocketId, channelId }) => {
    io.to(targetSocketId).emit('screen_viewer_left', {
      viewerSocketId: socket.id,
      channelId
    });
  });

  // Interação em Tempo Real
  socket.on('interaction_request', ({ targetSocketId, sessionId, metadata }) => {
    io.to(targetSocketId).emit('interaction_request', {
      fromSocketId: socket.id,
      fromUser: activeUsers[socket.id],
      sessionId,
      metadata
    });
  });

  socket.on('interaction_consent', ({ targetSocketId, sessionId, token, approved }) => {
    io.to(targetSocketId).emit('interaction_consent', {
      fromSocketId: socket.id,
      sessionId,
      token,
      approved
    });
  });

  socket.on('interaction_revoke', ({ targetSocketId, sessionId, reason }) => {
    io.to(targetSocketId).emit('interaction_revoke', {
      fromSocketId: socket.id,
      sessionId,
      reason
    });
  });

  socket.on('interaction_signal_offer', ({ targetSocketId, sessionId, sdp }) => {
    io.to(targetSocketId).emit('interaction_signal_offer', {
      fromSocketId: socket.id,
      sessionId,
      sdp
    });
  });

  socket.on('interaction_signal_answer', ({ targetSocketId, sessionId, sdp }) => {
    io.to(targetSocketId).emit('interaction_signal_answer', {
      fromSocketId: socket.id,
      sessionId,
      sdp
    });
  });

  socket.on('interaction_signal_candidate', ({ targetSocketId, sessionId, candidate }) => {
    io.to(targetSocketId).emit('interaction_signal_candidate', {
      fromSocketId: socket.id,
      sessionId,
      candidate
    });
  });

  socket.on('interaction_signal_ice', ({ targetSocketId, sessionId, candidate }) => {
    io.to(targetSocketId).emit('interaction_signal_candidate', {
      fromSocketId: socket.id,
      sessionId,
      candidate
    });
  });

  socket.on('interaction_event', ({ targetSocketId, sessionId, event }) => {
    io.to(targetSocketId).emit('interaction_event', {
      fromSocketId: socket.id,
      sessionId,
      event
    });
  });

  socket.on('disconnect', () => {
    delete activeUsers[socket.id];
    for (const chId in voiceRooms) {
      const idx = voiceRooms[chId].findIndex(p => p.socketId === socket.id);
      if (idx !== -1) {
        const participant = voiceRooms[chId][idx];
        if (participant.isScreenSharing) {
          socket.to(`voice_${chId}`).emit('screen_share_stopped', {
            channelId: chId,
            sharerSocketId: socket.id,
            user: participant.user
          });
        }
        socket.to(`voice_${chId}`).emit('user_left_voice', { channelId: chId, socketId: socket.id });
        voiceRooms[chId].splice(idx, 1);
        if (voiceRooms[chId].length === 0) delete voiceRooms[chId];
      }
    }
    io.emit('users_update', Object.values(activeUsers));
    io.emit('voice_state_update', voiceRooms);
  });
});

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Inicialização com execução controlada de migrations
async function startServer() {
  try {
    console.log(`[Database] Inicializando banco (Modo: ${db.isPostgres ? 'PostgreSQL' : 'SQLite Local'})...`);
    await runMigrations(db);
    console.log('[Database] Migrations verificadas com sucesso.');

    server.listen(PORT, HOST, () => {
      console.log(`\n======================================================`);
      console.log(`🚀 Servidor Backend Central Ativo:`);
      console.log(`   Host:    http://${HOST}:${PORT}`);
      console.log(`   Banco:   ${db.isPostgres ? 'PostgreSQL (Central)' : 'SQLite (Local Dev)'}`);
      console.log(`======================================================\n`);
    });
  } catch (err) {
    console.error('[Fatal Error] Falha na inicialização do servidor:', err);
    process.exit(1);
  }
}

startServer();
