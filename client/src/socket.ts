// One shared socket.io-client instance for the whole app. Importing this module connects
// to the server; every component/hook reuses the same connection.

import { io, type Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3004';

export const socket: Socket = io(SERVER_URL);
