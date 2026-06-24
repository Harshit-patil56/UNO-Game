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

// Uptime monitor endpoints (supporting both HEAD and GET)
app.head('/head', (req, res) => {
  res.status(200).end();
});
app.get('/head', (req, res) => {
  res.status(200).json({ status: 'OK' });
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

// Custom 404 (Not Found) JSON error handler
app.use((req, res, next) => {
  res.status(404).json({ error: 'Endpoint not found', status: 404 });
});

// Custom 500 (Internal Server Error) JSON error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error', status: 500 });
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
