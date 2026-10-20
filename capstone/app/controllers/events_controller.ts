import type { HttpContext } from '@adonisjs/core/http'
import { PassThrough } from 'node:stream'
import ChatService from '#services/chat_service'
import db from '@adonisjs/lucid/services/db'

export default class EventsController {
  async stream({ auth, request, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const id = Number(request.input('conversation', 0))
    if (!Number.isSafeInteger(id) || id < 0 || id > 2147483647) return response.badRequest()
    if (id && !(await ChatService.membership(user.id, id))) return response.notFound()
    const stream = new PassThrough()
    response.header('Content-Type', 'text/event-stream')
    response.header('Cache-Control', 'no-cache, no-transform')
    response.header('X-Accel-Buffering', 'no')
    response.stream(stream)
    stream.write('retry: 3000\n\n')
    let last = ''
    let running = false
    let closed = false
    const stop = () => {
      closed = true
      clearInterval(timer)
      clearTimeout(expiry)
      stream.end()
    }
    const tick = async () => {
      if (running || closed) return
      running = true
      try {
        const account = await db
          .from('users')
          .where('id', user.id)
          .select('password', 'email_verified_at')
          .first()
        if (!account?.email_verified_at || account.password !== user.password) {
          stream.write('event: expired\ndata: {}\n\n')
          return stop()
        }
        const conversation = id ? await ChatService.membership(user.id, id) : null
        if (id && !conversation) {
          stream.write('event: removed\ndata: {}\n\n')
          return stop()
        }
        const messages = id ? await ChatService.messages(id, undefined, user.id) : []
        if (id && messages.length) {
          const latest = messages[messages.length - 1].created_at
          await db
            .from('conversation_members')
            .where('conversation_id', id)
            .where('user_id', user.id)
            .where((q) =>
              q.whereNull('last_delivered_at').orWhere('last_delivered_at', '<', latest)
            )
            .update({ last_delivered_at: latest })
        }
        const members = id ? await ChatService.members(id) : []
        const other = members.find((member) => member.id !== user.id)
        const data = JSON.stringify({
          conversations: await ChatService.conversations(user.id),
          messages,
          members,
          isAdmin: !!conversation?.is_admin,
          addition:
            conversation?.type === 'group' && !conversation.removed_at && conversation.added_by_name
              ? { by: conversation.added_by_name, at: conversation.joined_at }
              : null,
          removal: conversation?.removed_at
            ? {
                at: conversation.removed_at,
                by: conversation.removed_by_name || 'Un administrateur',
              }
            : null,
          blocked:
            conversation?.type === 'private' && other
              ? await ChatService.blocked(user.id, other.id)
              : false,
        })
        if (closed) return
        if (data !== last) {
          if (!stream.write(`event: snapshot\ndata: ${data}\n\n`)) return stop()
          last = data
        } else stream.write(': heartbeat\n\n')
      } catch (error) {
        logger.error({ err: error }, 'Chat event stream failed')
        stop()
      } finally {
        running = false
      }
    }
    const timer = setInterval(() => void tick(), 2000)
    const expiry = setTimeout(stop, 25 * 60 * 1000)
    response.response.once('close', stop)
    void tick()
  }
}
