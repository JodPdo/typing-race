// Owns the set of live rooms. Transport-free (no socket.io / pg) like Room.

import { Mode } from '../types';
import { Room } from './Room';
import { pickPassage } from './passages';

// Codes use uppercase letters + digits but EXCLUDE easily-confused glyphs: 0/O, 1/I.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  constructor(private readonly opts: { maxCharsPerSec: number }) {}

  create(mode: Mode): Room {
    const code = this.generateUniqueCode();
    const room = new Room(code, mode, pickPassage(), { maxCharsPerSec: this.opts.maxCharsPerSec });
    this.rooms.set(code, room);
    return room;
  }

  /** Case-insensitive lookup (codes are stored uppercase). */
  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  remove(code: string): void {
    this.rooms.delete(code.toUpperCase());
  }

  private generateCode(): string {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return code;
  }

  private generateUniqueCode(): string {
    let code = this.generateCode();
    while (this.rooms.has(code)) {
      code = this.generateCode();
    }
    return code;
  }
}
