import { io, type Socket } from 'socket.io-client';
import { useAuth } from '../store/auth';
import { API_ORIGIN } from './api';

let socket: Socket | null = null;

/** Duel uchun real vaqt ulanishi (Railway WebSocket). */
export function getSocket(): Socket {
  if (socket && socket.connected) return socket;
  socket?.disconnect();
  socket = io(API_ORIGIN || window.location.origin, {
    path: '/socket.io',
    auth: { token: useAuth.getState().token },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 10,
  });
  return socket;
}
