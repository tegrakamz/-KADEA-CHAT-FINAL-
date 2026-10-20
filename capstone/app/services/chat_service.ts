import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

function conversationTime(value: unknown) {
  if (!value) return ''
  const date = new Date(String(value))
  const options = { timeZone: 'Africa/Lagos' }
  const today =
    date.toLocaleDateString('fr-FR', options) === new Date().toLocaleDateString('fr-FR', options)
  return today
    ? date.toLocaleTimeString('fr-FR', { ...options, hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('fr-FR', {
        ...options,
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      })
}

export default class ChatService {
  static async groupEvent(
    trx: TransactionClientContract,
    conversationId: number,
    actor: { id: number; fullName: string | null },
    target: string,
    kind: 'added' | 'removed' | 'promoted',
    at: Date
  ) {
    const actorName = actor.fullName || 'Un administrateur'
    const action = kind === 'added' ? 'a ajouté' : kind === 'removed' ? 'a retiré' : 'a nommé'
    const ending =
      kind === 'added' ? 'au groupe' : kind === 'removed' ? 'du groupe' : 'administrateur du groupe'
    await trx.table('messages').insert({
      conversation_id: conversationId,
      user_id: actor.id,
      body: `${actorName} ${action} ${target} ${ending}.`,
      event_kind: kind,
      event_actor_name: actorName,
      event_target_name: target,
      created_at: at,
    })
    await trx.from('conversations').where('id', conversationId).update({ updated_at: at })
  }
  static membership(userId: number, id: number) {
    return db
      .from('conversation_members as cm')
      .join('conversations as c', 'c.id', 'cm.conversation_id')
      .where('cm.user_id', userId)
      .where('c.id', id)
      .select(
        'c.id',
        'c.name',
        'c.type',
        'cm.is_admin',
        'cm.last_read_at',
        'cm.created_at as joined_at',
        'cm.added_by_name',
        'cm.removed_at',
        'cm.removed_by_name'
      )
      .first()
  }

  static async conversations(userId: number) {
    const result = await db.rawQuery(
      `SELECT c.id, c.name, c.type, c.updated_at,
      COALESCE(c.name, other.full_name, other.email, 'Conversation') AS "displayName",
      lm.body AS last_body, lm.deleted_at AS last_deleted_at, lm.created_at AS last_message_at,
      other.id AS other_user_id, other.avatar AS other_avatar, mine.removed_at, mine.removed_by_name,
      CASE WHEN c.type = 'group' THEN (SELECT json_agg(json_build_object('id', u.id, 'avatar', u.avatar, 'fullName', u.full_name) ORDER BY cm.id)
        FROM conversation_members cm JOIN users u ON u.id = cm.user_id WHERE cm.conversation_id = c.id AND cm.removed_at IS NULL) ELSE NULL END AS "avatarMembers",
      (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id = c.id AND m.user_id <> ?
        AND m.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM message_hides mh WHERE mh.message_id = m.id AND mh.user_id = mine.user_id)
        AND (mine.removed_at IS NULL OR m.created_at <= mine.removed_at)
        AND (c.type <> 'group' OR m.created_at >= mine.created_at)
        AND (mine.last_read_at IS NULL OR m.created_at > mine.last_read_at)) AS unread
      FROM conversation_members mine JOIN conversations c ON c.id = mine.conversation_id
      LEFT JOIN LATERAL (SELECT u.id, u.avatar, u.full_name, u.email FROM conversation_members cm JOIN users u ON u.id = cm.user_id
        WHERE cm.conversation_id = c.id AND cm.user_id <> ? ORDER BY cm.id LIMIT 1) other ON true
      LEFT JOIN LATERAL (SELECT body, deleted_at, created_at FROM messages WHERE conversation_id = c.id
        AND (mine.removed_at IS NULL OR messages.created_at <= mine.removed_at)
        AND (c.type <> 'group' OR messages.created_at >= mine.created_at)
        AND NOT EXISTS (SELECT 1 FROM message_hides mh WHERE mh.message_id = messages.id AND mh.user_id = mine.user_id)
        ORDER BY id DESC LIMIT 1) lm ON true
      WHERE mine.user_id = ? ORDER BY c.updated_at DESC, c.id DESC`,
      [userId, userId, userId]
    )
    return result.rows.map((row: Record<string, unknown>) => ({
      ...row,
      lastMessage: row.removed_at
        ? { body: `${row.removed_by_name || 'Un administrateur'} vous a retiré du groupe.` }
        : row.last_message_at
          ? { body: row.last_deleted_at ? 'Ce message a été supprimé.' : row.last_body }
          : null,
      lastMessageTime: conversationTime(row.removed_at || row.last_message_at),
    }))
  }

  static members(id: number) {
    return db
      .from('conversation_members as cm')
      .join('users as u', 'u.id', 'cm.user_id')
      .where('cm.conversation_id', id)
      .whereNull('cm.removed_at')
      .select(
        'u.id',
        'u.full_name as fullName',
        'u.email',
        'u.avatar',
        'cm.is_admin',
        'cm.last_read_at',
        'cm.last_delivered_at'
      )
      .orderBy('cm.id')
  }

  static async messages(id: number, before?: number, userId?: number) {
    const query = db
      .from('messages as m')
      .join('users as u', 'u.id', 'm.user_id')
      .where('m.conversation_id', id)
      .whereNotExists(
        db
          .from('message_hides as mh')
          .select('mh.message_id')
          .whereColumn('mh.message_id', 'm.id')
          .where('mh.user_id', userId || 0)
      )
      .select('m.edited_at')
      .select('m.event_kind', 'm.event_actor_name', 'm.event_target_name')
      .select('m.id', 'm.user_id', 'm.created_at', 'm.deleted_at', 'u.full_name as author_name')
      .select(db.raw('CASE WHEN m.deleted_at IS NULL THEN m.body ELSE NULL END AS body'))
      .orderBy('m.id', 'desc')
      .limit(100)
    if (before) query.where('m.id', '<', before)
    if (userId)
      query.whereExists(
        db
          .from('conversation_members as viewer')
          .join('conversations as visibility', 'visibility.id', 'viewer.conversation_id')
          .select('viewer.id')
          .whereColumn('viewer.conversation_id', 'm.conversation_id')
          .where('viewer.user_id', userId)
          .where((q) =>
            q
              .where('visibility.type', 'private')
              .orWhereColumn('m.created_at', '>=', 'viewer.created_at')
          )
          .where((q) =>
            q
              .whereNull('viewer.removed_at')
              .orWhereColumn('m.created_at', '<=', 'viewer.removed_at')
          )
      )
    const rows = await query
    return rows.reverse().map((message) => ({
      ...message,
      body: message.event_kind
        ? `${message.user_id === userId ? 'Vous avez' : (message.event_actor_name || message.author_name || 'Un administrateur') + ' a'} ${message.event_kind === 'added' ? 'ajouté' : message.event_kind === 'removed' ? 'retiré' : 'nommé'} ${message.event_target_name} ${message.event_kind === 'added' ? 'au groupe' : message.event_kind === 'removed' ? 'du groupe' : 'administrateur du groupe'}.`
        : message.body,
      timeLabel: new Date(message.created_at).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Lagos',
      }),
    }))
  }

  static async blocked(a: number, b: number) {
    return !!(await db
      .from('user_blocks')
      .where((q) => q.where('user_id', a).where('blocked_user_id', b))
      .orWhere((q) => q.where('user_id', b).where('blocked_user_id', a))
      .first())
  }
}
