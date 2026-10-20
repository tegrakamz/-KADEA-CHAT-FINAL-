import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import ChatService from '#services/chat_service'
import GroupService from '#services/group_service'
import {
  createConversationValidator,
  sendMessageValidator,
  groupValidator,
} from '#validators/conversation'

export default class ConversationController {
  async memberProfile({ auth, params, view, response }: HttpContext) {
    const target = await db
      .from('users as u')
      .where('u.id', params.id)
      .whereExists(
        db
          .from('conversation_members as theirs')
          .join('conversation_members as mine', 'mine.conversation_id', 'theirs.conversation_id')
          .whereColumn('theirs.user_id', 'u.id')
          .where('mine.user_id', auth.getUserOrFail().id)
          .select('theirs.id')
      )
      .select('u.id', 'u.full_name', 'u.avatar')
      .first()
    if (!target) return response.notFound()
    return view.render('pages/member_profile', {
      target,
      own: target.id === auth.getUserOrFail().id,
    })
  }

  async startPrivate(context: HttpContext) {
    const target = await db.from('users').where('id', context.params.id).select('email').first()
    if (!target) return context.response.notFound()
    context.request.updateBody({ email: target.email })
    return this.store(context)
  }
  async index({ auth, view }: HttpContext) {
    const user = auth.getUserOrFail()
    return view.render('pages/dashboard', {
      conversations: await ChatService.conversations(user.id),
      user,
      currentConversationId: null,
    })
  }

  async store({ auth, request, response, session }: HttpContext) {
    const user = auth.getUserOrFail()
    const { email } = await request.validateUsing(createConversationValidator)
    const recipient = await db
      .from('users')
      .whereRaw('LOWER(email) = ?', [email])
      .whereNotNull('email_verified_at')
      .first()
    if (
      !recipient ||
      recipient.id === user.id ||
      (await ChatService.blocked(user.id, recipient.id))
    ) {
      session.flashOnly(['email'])
      session.flash('error', 'Impossible de démarrer une discussion avec cet utilisateur.')
      return response.redirect('/dashboard')
    }
    const id = await db.transaction(async (trx) => {
      await trx.rawQuery('SELECT pg_advisory_xact_lock(?, ?)', [
        Math.min(user.id, recipient.id),
        Math.max(user.id, recipient.id),
      ])
      const existing = await trx
        .from('conversation_members as mine')
        .join('conversation_members as other', 'other.conversation_id', 'mine.conversation_id')
        .join('conversations as c', 'c.id', 'mine.conversation_id')
        .where('mine.user_id', user.id)
        .where('other.user_id', recipient.id)
        .where('c.type', 'private')
        .select('c.id')
        .first()
      if (existing) return existing.id
      const now = new Date()
      const [conversation] = await trx
        .table('conversations')
        .insert({ type: 'private', created_by: user.id, created_at: now, updated_at: now })
        .returning('id')
      await trx.table('conversation_members').insert([
        { conversation_id: conversation.id, user_id: user.id, is_admin: true, created_at: now },
        {
          conversation_id: conversation.id,
          user_id: recipient.id,
          is_admin: false,
          created_at: now,
        },
      ])
      return conversation.id
    })
    return response.redirect(`/conversations/${id}`)
  }

  async show({ auth, params, request, response, view }: HttpContext) {
    const user = auth.getUserOrFail()
    const id = Number(params.id)
    if (!Number.isSafeInteger(id) || id < 1) return response.notFound()
    const conversation = await ChatService.membership(user.id, id)
    if (!conversation) return response.notFound()
    const before = Number(request.input('before'))
    if (
      request.input('before') !== undefined &&
      (!Number.isSafeInteger(before) || before < 1 || before > 2147483647)
    ) {
      return response.badRequest('Pagination invalide.')
    }
    const members = await ChatService.members(id)
    const messages = await ChatService.messages(id, before > 0 ? before : undefined, user.id)
    const other = members.find((member) => member.id !== user.id)
    return view.render('pages/conversation', {
      conversation,
      conversationTitle: conversation.name || other?.fullName || other?.email || 'Conversation',
      members,
      peer: other,
      messages,
      user,
      conversations: await ChatService.conversations(user.id),
      currentUserId: user.id,
      currentConversationId: id,
      historyMode: before > 0,
      canLoadOlder: messages.length === 100,
      isBlocked:
        conversation.type === 'private' && other
          ? await ChatService.blocked(user.id, other.id)
          : false,
      isRemoved: !!conversation.removed_at,
    })
  }

  async sendMessage({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const id = Number(params.id)
    if (!Number.isSafeInteger(id) || id < 1) return response.notFound()
    const { body } = await request.validateUsing(sendMessageValidator)
    const sent = await db.transaction(async (trx) => {
      const member = await trx
        .from('conversation_members')
        .where('conversation_id', id)
        .where('user_id', user.id)
        .forUpdate()
        .first()
      if (!member) return 'missing'
      if (member.removed_at) return 'removed'
      const conversation = await trx.from('conversations').where('id', id).first()
      if (conversation.type === 'private') {
        const other = await trx
          .from('conversation_members')
          .where('conversation_id', id)
          .whereNot('user_id', user.id)
          .first()
        if (other && (await ChatService.blocked(user.id, other.user_id))) return 'blocked'
      }
      const now = new Date()
      await trx
        .table('messages')
        .insert({ conversation_id: id, user_id: user.id, body, created_at: now })
      await trx.from('conversations').where('id', id).update({ updated_at: now })
      return 'sent'
    })
    if (sent === 'missing') return response.notFound()
    if (sent === 'removed')
      return response.forbidden({
        message: 'Vous avez été retiré de ce groupe. Vous ne pouvez plus y envoyer de messages.',
      })
    if (sent === 'blocked')
      return response.forbidden({ message: 'Cette conversation est bloquée.' })
    if (request.accepts(['json', 'html']) === 'json') return response.created({ sent: true })
    return response.redirect(`/conversations/${id}`)
  }

  async deleteMessage({ auth, params, response }: HttpContext) {
    const membership = await ChatService.membership(auth.getUserOrFail().id, Number(params.id))
    if (!membership) return response.notFound()
    const message = await db
      .from('messages')
      .where('id', params.messageId)
      .where('conversation_id', params.id)
      .first()
    if (!message) return response.notFound()
    if (message.event_kind)
      return response.forbidden({ message: 'Les avis du groupe ne peuvent pas être supprimés.' })
    if (
      membership.type === 'group' &&
      (new Date(message.created_at) < new Date(membership.joined_at) ||
        (membership.removed_at && new Date(message.created_at) > new Date(membership.removed_at)))
    )
      return response.notFound()
    if (message.user_id !== auth.getUserOrFail().id) {
      await db
        .table('message_hides')
        .insert({ message_id: message.id, user_id: auth.getUserOrFail().id })
        .onConflict(['message_id', 'user_id'])
        .ignore()
      return response.ok({ hidden: true })
    }
    const changed = await db
      .from('messages')
      .where('id', params.messageId)
      .where('conversation_id', params.id)
      .where('user_id', auth.getUserOrFail().id)
      .whereNull('deleted_at')
      .update({ deleted_at: new Date(), body: '' })
    return changed ? response.ok({ deleted: true }) : response.notFound()
  }

  async editMessage({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const membership = await ChatService.membership(user.id, Number(params.id))
    if (!membership) return response.notFound()
    if (membership.removed_at)
      return response.forbidden({
        message: 'Vous ne pouvez plus modifier les messages de ce groupe.',
      })
    const { body } = await request.validateUsing(sendMessageValidator)
    const query = db
      .from('messages')
      .where('id', params.messageId)
      .where('conversation_id', params.id)
      .where('user_id', user.id)
      .whereNull('deleted_at')
      .whereNull('event_kind')
      .where('created_at', '>', db.raw("CURRENT_TIMESTAMP - INTERVAL '5 minutes'"))
    if (membership.type === 'group') query.where('created_at', '>=', membership.joined_at)
    const changed = await query.update({ body, edited_at: new Date() })
    return changed
      ? response.ok({ edited: true })
      : response.forbidden({
          message:
            'Modification impossible : le délai de 5 minutes est dépassé ou ce message ne peut pas être modifié.',
        })
  }

  async users({ auth, request, response }: HttpContext) {
    const query = String(request.input('q', '')).trim().slice(0, 100)
    if (query.length < 2) return response.ok([])
    return response.ok(
      await db
        .from('users')
        .whereNot('id', auth.getUserOrFail().id)
        .whereNotNull('email_verified_at')
        .where((q) => q.whereILike('full_name', `%${query}%`).orWhereILike('email', `%${query}%`))
        .select('id', 'full_name', 'email', 'avatar')
        .limit(15)
    )
  }

  async group({ auth, request, response, session }: HttpContext) {
    const { name, emails } = await request.validateUsing(groupValidator)
    const addresses = [
      ...new Set(
        emails
          .split(/[\s,;]+/)
          .map((email) => email.toLowerCase())
          .filter(Boolean)
      ),
    ]
    const users =
      addresses.length <= 50
        ? await db
            .from('users')
            .whereIn(db.raw('LOWER(email)'), addresses)
            .whereNotNull('email_verified_at')
            .select('id', 'full_name', 'email')
        : []
    const userId = auth.getUserOrFail().id
    const ids = [...new Set([userId, ...users.map((user) => user.id)])]
    if (users.length !== addresses.length || ids.length < 3) {
      session.flashOnly(['name', 'emails'])
      session.flash(
        'error',
        'Ajoutez entre 2 et 50 membres avec des adresses de comptes confirmés.'
      )
      return response.redirect('/dashboard')
    }
    const id = await GroupService.create(auth.getUserOrFail(), name, users)
    return response.redirect(`/conversations/${id}`)
  }

  async addMember({ auth, params, request, response, session }: HttpContext) {
    const member = await ChatService.membership(auth.getUserOrFail().id, Number(params.id))
    if (!member?.is_admin || member.removed_at || member.type !== 'group')
      return response.forbidden()
    const { email } = await request.validateUsing(createConversationValidator)
    const user = await db
      .from('users')
      .whereRaw('LOWER(email) = ?', [email])
      .whereNotNull('email_verified_at')
      .first()
    if (!user) session.flash('error', 'Aucun compte confirmé ne correspond à cette adresse.')
    else {
      const result = await GroupService.add(auth.getUserOrFail(), member.id, user)
      if (!result) return response.forbidden()
      session.flash('success', 'Membre ajouté au groupe.')
    }
    return response.redirect(`/conversations/${params.id}`)
  }

  async removeMember({ auth, params, response }: HttpContext) {
    const member = await ChatService.membership(auth.getUserOrFail().id, Number(params.id))
    if (!member?.is_admin || member.removed_at || member.type !== 'group')
      return response.forbidden()
    if (
      !(await GroupService.remove(auth.getUserOrFail(), Number(params.id), Number(params.userId)))
    )
      return response.badRequest({ message: 'Ce membre ne peut pas ?tre retir?.' })
    return response.redirect(`/conversations/${params.id}`)
  }

  async promoteMember({ auth, params, response, session }: HttpContext) {
    const actor = auth.getUserOrFail()
    const group = await ChatService.membership(actor.id, Number(params.id))
    if (!group?.is_admin || group.removed_at || group.type !== 'group') return response.forbidden()
    const promoted = await GroupService.promote(actor, Number(params.id), Number(params.userId))
    session.flash(
      promoted ? 'success' : 'error',
      promoted
        ? 'Le membre est maintenant administrateur.'
        : 'Ce membre est déjà administrateur ou ne fait plus partie du groupe.'
    )
    return response.redirect(`/conversations/${params.id}`)
  }

  async read({ auth, params, response }: HttpContext) {
    const changed = await db
      .from('conversation_members')
      .where('user_id', auth.getUserOrFail().id)
      .where('conversation_id', params.id)
      .update({ last_read_at: new Date(), last_delivered_at: new Date() })
    return changed ? response.ok({ read: true }) : response.notFound()
  }

  async search({ auth, request, view }: HttpContext) {
    const query = String(request.input('q', '')).trim().slice(0, 100)
    const results =
      query.length < 2
        ? []
        : await db
            .from('messages as m')
            .join('conversation_members as cm', 'cm.conversation_id', 'm.conversation_id')
            .join('conversations as visibility', 'visibility.id', 'm.conversation_id')
            .join('users as u', 'u.id', 'm.user_id')
            .where('cm.user_id', auth.getUserOrFail().id)
            .where((q) =>
              q
                .where('visibility.type', 'private')
                .orWhereColumn('m.created_at', '>=', 'cm.created_at')
            )
            .where((q) =>
              q.whereNull('cm.removed_at').orWhereColumn('m.created_at', '<=', 'cm.removed_at')
            )
            .whereNull('m.deleted_at')
            .whereNotExists(
              db
                .from('message_hides as mh')
                .select('mh.message_id')
                .whereColumn('mh.message_id', 'm.id')
                .where('mh.user_id', auth.getUserOrFail().id)
            )
            .whereILike('m.body', `%${query}%`)
            .select('m.id', 'm.body', 'm.conversation_id', 'u.full_name')
            .orderBy('m.id', 'desc')
            .limit(50)
    return view.render('pages/search', { query, results })
  }

  async block({ auth, params, response, session }: HttpContext) {
    const userId = auth.getUserOrFail().id
    const target = await db.from('users').where('id', params.id).whereNot('id', userId).first()
    if (!target) return response.notFound()
    await db
      .table('user_blocks')
      .insert({ user_id: userId, blocked_user_id: target.id })
      .onConflict(['user_id', 'blocked_user_id'])
      .ignore()
    session.flash('success', 'Utilisateur bloqué. Gérez les blocages depuis votre profil.')
    return response.redirect('/profile')
  }
}
