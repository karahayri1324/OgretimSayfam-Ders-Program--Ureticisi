import { getDb } from '../connection.js';
import { schoolsRepo } from './schools.js';
import type { AIMessage } from '../../../src/lib/types.js';

type AIMessageRow = {
  id: number;
  role: string;
  text: string;
  parent_id: number | null;
  created_at: string;
};

function rowToMessage(r: AIMessageRow): AIMessage {
  const role: AIMessage['role'] =
    r.role === 'user' || r.role === 'assistant' || r.role === 'system'
      ? r.role
      : 'user';
  return {
    id: r.id,
    role,
    text: r.text,
    parentId: r.parent_id,
    createdAt: r.created_at,
  };
}

export type AddAIMessageInput = {
  role: 'user' | 'assistant' | 'system';
  text: string;
  parentId?: number | null;
};

export const aiHistoryRepo = {
  list(): AIMessage[] {
    const rows = getDb()
      .prepare(
        `SELECT id, role, text, parent_id, created_at
         FROM ai_messages
         WHERE school_id = ?
         ORDER BY created_at ASC, id ASC`,
      )
      .all(schoolsRepo.getActiveId()) as AIMessageRow[];
    return rows.map(rowToMessage);
  },

  add(input: AddAIMessageInput): number {
    const result = getDb()
      .prepare(
        `INSERT INTO ai_messages (school_id, role, text, parent_id)
         VALUES (?, ?, ?, ?)`,
      )
      .run(
        schoolsRepo.getActiveId(),
        input.role,
        input.text,
        input.parentId ?? null,
      );
    return Number(result.lastInsertRowid);
  },

  clear(): void {
    getDb()
      .prepare('DELETE FROM ai_messages WHERE school_id = ?')
      .run(schoolsRepo.getActiveId());
  },
};

export const aiMessagesRepo = aiHistoryRepo;
