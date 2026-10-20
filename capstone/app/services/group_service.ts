import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import ChatService from '#services/chat_service'

type Actor = { id: number; fullName: string | null }
type Member = { id: number; full_name: string | null; email: string }

export default class GroupService {
  private static async authorized(
    trx: TransactionClientContract,
    groupId: number,
    actorId: number
  ) {
    const group = await trx
      .from('conversations')
      .where('id', groupId)
      .where('type', 'group')
      .first()
    if (!group) return false
    const member = await trx
      .from('conversation_members')
      .where('conversation_id', groupId)
      .where('user_id', actorId)
      .forUpdate()
      .first()
    return !!member?.is_admin && !member.removed_at
  }

  static create(actor: Actor, name: string, members: Member[]) {
    return db.transaction(async (trx) => {
      const now = new Date()
      const [group] = await trx
        .table('conversations')
        .insert({ name, type: 'group', created_by: actor.id, created_at: now, updated_at: now })
        .returning('id')
      const ids = [...new Set([actor.id, ...members.map((member) => member.id)])]
      await trx.table('conversation_members').insert(
        ids.map((id) => ({
          conversation_id: group.id,
          user_id: id,
          is_admin: id === actor.id,
          added_by: id === actor.id ? null : actor.id,
          added_by_name: id === actor.id ? null : actor.fullName || 'Un administrateur',
          created_at: now,
        }))
      )
      for (const member of members) {
        if (member.id !== actor.id)
          await ChatService.groupEvent(
            trx,
            group.id,
            actor,
            member.full_name || member.email,
            'added',
            now
          )
      }
      return group.id as number
    })
  }

  static add(actor: Actor, groupId: number, target: Member) {
    return db.transaction(async (trx) => {
      if (!(await this.authorized(trx, groupId, actor.id))) return false
      const now = new Date()
      const attribution = {
        added_by: actor.id,
        added_by_name: actor.fullName || 'Un administrateur',
        created_at: now,
      }
      const inserted = await trx
        .table('conversation_members')
        .insert({ conversation_id: groupId, user_id: target.id, is_admin: false, ...attribution })
        .onConflict(['conversation_id', 'user_id'])
        .ignore()
        .returning('id')
      const restored = await trx
        .from('conversation_members')
        .where('conversation_id', groupId)
        .where('user_id', target.id)
        .whereNotNull('removed_at')
        .update({
          ...attribution,
          removed_at: null,
          removed_by: null,
          removed_by_name: null,
          last_read_at: null,
          last_delivered_at: null,
        })
      if (inserted.length || restored)
        await ChatService.groupEvent(
          trx,
          groupId,
          actor,
          target.full_name || target.email,
          'added',
          now
        )
      return true
    })
  }

  static remove(actor: Actor, groupId: number, targetId: number) {
    return db.transaction(async (trx) => {
      if (!(await this.authorized(trx, groupId, actor.id))) return false
      const target = await trx.from('users').where('id', targetId).first()
      if (!target) return false
      const now = new Date()
      const changed = await trx
        .from('conversation_members')
        .where('conversation_id', groupId)
        .where('user_id', targetId)
        .where('is_admin', false)
        .whereNull('removed_at')
        .update({
          removed_at: now,
          removed_by: actor.id,
          removed_by_name: actor.fullName || 'Un administrateur',
        })
      if (changed)
        await ChatService.groupEvent(
          trx,
          groupId,
          actor,
          target.full_name || target.email,
          'removed',
          now
        )
      return !!changed
    })
  }

  static promote(actor: Actor, groupId: number, targetId: number) {
    return db.transaction(async (trx) => {
      if (!(await this.authorized(trx, groupId, actor.id))) return false
      const target = await trx.from('users').where('id', targetId).first()
      if (!target) return false
      const changed = await trx
        .from('conversation_members')
        .where('conversation_id', groupId)
        .where('user_id', targetId)
        .whereNull('removed_at')
        .where('is_admin', false)
        .update({ is_admin: true })
      if (changed)
        await ChatService.groupEvent(
          trx,
          groupId,
          actor,
          target.full_name || target.email,
          'promoted',
          new Date()
        )
      return !!changed
    })
  }
}
