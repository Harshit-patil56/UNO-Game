import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { registerSocketHandlers } from '../src/socket/index.js';
import { getRoom } from '../src/rooms/index.js';

// Configure dot env and force nodemon reload trigger (turnStartedAt sync added)
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Basic health check route
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: Date.now(),
    message: 'UNO Authoritative Game Server is healthy'
  });
});

// Fetch room details by ID (gameMode lookup)
app.get('/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  const room = getRoom(roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json({ roomId: room.roomId, gameMode: room.gameMode });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Configure Socket.IO event registrations
io.on('connection', (socket) => {
  registerSocketHandlers(io, socket);
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`UNO Server booted successfully. Listening on port ${PORT}`);
});
