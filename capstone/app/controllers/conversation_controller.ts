import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import User from '#models/user'
import { createConversationValidator, sendMessageValidator } from '#validators/conversation'

function formatTime(value: unknown) {
  if (!value) return ''
  const time = value instanceof Date ? DateTime.fromJSDate(value) : DateTime.fromSQL(String(value))
  return time.isValid ? time.toFormat('HH:mm') : ''
}

export default class ConversationController {
  async index({ auth, view }: HttpContext) {
    const user = auth.getUserOrFail()
    const conversations = await this.getConversations(user.id)
    return view.render('pages/dashboard', { conversations, user, currentConversationId: null })
  }

  private async getConversations(userId: number) {
    const conversationRows = await db
      .from('conversation_members as mine')
      .join('conversations as c', 'c.id', 'mine.conversation_id')
      .where('mine.user_id', userId)
      .select('c.id', 'c.name', 'c.type', 'c.updated_at')
      .orderBy('c.updated_at', 'desc')

    const conversations = await Promise.all(
      conversationRows.map(async (conversation) => {
        const lastMessage = await db
          .from('messages')
          .where('conversation_id', conversation.id)
          .whereNull('deleted_at')
          .select('body', 'created_at')
          .orderBy('created_at', 'desc')
          .first()
        const otherMember = await db
          .from('conversation_members as cm')
          .join('users as u', 'u.id', 'cm.user_id')
          .where('cm.conversation_id', conversation.id)
          .whereNot('cm.user_id', userId)
          .select('u.full_name as fullName', 'u.email')
          .first()
        return {
          ...conversation,
          lastMessage,
          lastMessageTime: formatTime(lastMessage?.created_at),
          displayName: conversation.name || otherMember?.fullName || otherMember?.email || 'Conversation',
        }
      })
    )
    return conversations
  }

  async store({ auth, request, response, session }: HttpContext) {
    const user = auth.getUserOrFail()
    const { email } = await request.validateUsing(createConversationValidator)
    const recipient = await User.query().whereRaw('LOWER(email) = LOWER(?)', [email]).first()

    if (!recipient || recipient.id === user.id) {
      session.flash('errors', { email: "Cette adresse n'est pas disponible pour démarrer une conversation." })
      return response.redirect().toRoute('dashboard')
    }

    const existing = await db
      .from('conversation_members as mine')
      .join('conversation_members as other', 'other.conversation_id', 'mine.conversation_id')
      .join('conversations as c', 'c.id', 'mine.conversation_id')
      .where('mine.user_id', user.id)
      .where('other.user_id', recipient.id)
      .where('c.type', 'private')
      .select('c.id')
      .first()

    if (existing) return response.redirect().toRoute('conversations.show', { id: existing.id })

    const conversationId = await db.transaction(async (trx) => {
      const now = DateTime.now().toSQL()!
      const inserted = await trx
        .table('conversations')
        .insert({ type: 'private', created_by: user.id, created_at: now, updated_at: now })
        .returning('id')
      const conversationId = typeof inserted[0] === 'object' ? inserted[0].id : inserted[0]
      await trx.table('conversation_members').insert([
        { conversation_id: conversationId, user_id: user.id, is_admin: true, created_at: now },
        { conversation_id: conversationId, user_id: recipient.id, is_admin: false, created_at: now },
      ])
      return conversationId
    })

    return response.redirect().toRoute('conversations.show', { id: conversationId })
  }

  async show({ auth, params, response, view }: HttpContext) {
    const user = auth.getUserOrFail()
    const conversationId = Number(params.id)
    if (!Number.isInteger(conversationId) || conversationId < 1) return response.notFound()

    const membership = await db
      .from('conversation_members as cm')
      .join('conversations as c', 'c.id', 'cm.conversation_id')
      .where('cm.conversation_id', conversationId)
      .where('cm.user_id', user.id)
      .select('c.id', 'c.name', 'c.type')
      .first()
    if (!membership) return response.notFound()

    const messageRows = await db
      .from('messages as m')
      .join('users as u', 'u.id', 'm.user_id')
      .where('m.conversation_id', conversationId)
      .select('m.id', 'm.body', 'm.created_at', 'm.deleted_at', 'm.user_id', 'u.full_name as author_name')
      .orderBy('m.created_at', 'asc')
    const messages = messageRows.map((message) => ({ ...message, timeLabel: formatTime(message.created_at) }))

    const members = await db
      .from('conversation_members as cm')
      .join('users as u', 'u.id', 'cm.user_id')
      .where('cm.conversation_id', conversationId)
      .select('u.id', 'u.full_name as fullName', 'u.email')

    const otherMember = members.find((member) => member.id !== user.id)
    const conversations = await this.getConversations(user.id)
    return view.render('pages/conversation', {
      conversation: membership,
      conversationTitle: membership.name || otherMember?.fullName || otherMember?.email || 'Conversation',
      messages,
      members,
      conversations,
      user,
      currentUserId: user.id,
      currentConversationId: conversationId,
    })
  }

  async sendMessage({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const conversationId = Number(params.id)
    if (!Number.isInteger(conversationId) || conversationId < 1) return response.notFound()

    const member = await db
      .from('conversation_members')
      .where('conversation_id', conversationId)
      .where('user_id', user.id)
      .first()
    if (!member) return response.notFound()

    const { body } = await request.validateUsing(sendMessageValidator)
    const now = DateTime.now().toSQL()!
    await db.transaction(async (trx) => {
      await trx.table('messages').insert({ conversation_id: conversationId, user_id: user.id, body, created_at: now })
      await trx.from('conversations').where('id', conversationId).update({ updated_at: now })
    })

    return response.redirect().toRoute('conversations.show', { id: conversationId })
  }
}
