import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { registerSocketHandlers } from '../src/socket/index.js';
import { getRoom } from '../src/rooms/index.js';

// Configure dot env and force nodemon reload trigger (contact receiver email updated)
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

// POST /api/contact - Handle contact form submissions using Resend API
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Name, email, and message are required' });
    }
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn('RESEND_API_KEY is not defined. Logging message locally:', { name, email, message });
      return res.status(200).json({ success: true, message: 'Message logged (dry run)' });
    }
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: process.env.CONTACT_SENDER_EMAIL || 'UNO Contact Form <onboarding@resend.dev>',
        to: process.env.CONTACT_RECEIVER_EMAIL || 'your-personal-email@gmail.com',
        subject: `UNO Feedback from ${name}`,
        html: `
          <h3>New Message from UNO Contact Form</h3>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Message:</strong></p>
          <p style="white-space: pre-wrap; background-color: #f1f5f9; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e1;">${message}</p>
        `
      })
    });
    if (!emailResponse.ok) {
      const errorJson = await emailResponse.json().catch(() => ({}));
      console.error('Resend API error:', errorJson);
      return res.status(emailResponse.status).json({
        error: errorJson.message || 'Failed to send email via Resend',
        details: errorJson
      });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Contact form submission error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
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
