import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'
const ConversationController = () => import('#controllers/conversation_controller')
const AccountController = () => import('#controllers/account_controller')
const SessionController = () => import('#controllers/session_controller')
const NewAccountController = () => import('#controllers/new_account_controller')
const EventsController = () => import('#controllers/events_controller')
import db from '@adonisjs/lucid/services/db'

router.on('/').render('pages/home').as('home')
router.get('/health', async ({ response }) => {
  try {
    await db.rawQuery('SELECT 1')
    return response.ok({ status: 'ok' })
  } catch {
    return response.serviceUnavailable({ status: 'unavailable' })
  }
})
router
  .group(() => {
    router.get('/signup', [NewAccountController, 'create']).as('new_account.create')
    router
      .post('/signup', [NewAccountController, 'store'])
      .as('new_account.store')
      .use(middleware.rateLimit())
    router.get('/login', [SessionController, 'create']).as('session.create')
    router
      .post('/login', [SessionController, 'store'])
      .as('session.store')
      .use(middleware.rateLimit())
  })
  .use(middleware.guest())

router.get('/verify-email', [AccountController, 'verification'])
router
  .post('/verify-email', [AccountController, 'send'])
  .as('account.resend')
  .use(middleware.rateLimit())
router.get('/verify-email/:token', [AccountController, 'verify'])
router.get('/forgot-password', [AccountController, 'forgot'])
router
  .post('/forgot-password', [AccountController, 'send'])
  .as('account.forgot.send')
  .use(middleware.rateLimit())
router.get('/reset-password/:token', [AccountController, 'resetForm'])
router.post('/reset-password/:token', [AccountController, 'reset']).use(middleware.rateLimit())

router
  .group(() => {
    router.get('/dashboard', [ConversationController, 'index']).as('dashboard')
    router.post('/conversations', [ConversationController, 'store']).as('conversations.store')
    router.post('/groups', [ConversationController, 'group'])
    router.get('/conversations/:id', [ConversationController, 'show']).as('conversations.show')
    router
      .post('/conversations/:id/messages', [ConversationController, 'sendMessage'])
      .as('messages.store')
    router.delete('/conversations/:id/messages/:messageId', [
      ConversationController,
      'deleteMessage',
    ])
    router.patch('/conversations/:id/messages/:messageId', [ConversationController, 'editMessage'])
    router.post('/conversations/:id/read', [ConversationController, 'read'])
    router.post('/conversations/:id/members', [ConversationController, 'addMember'])
    router.post('/conversations/:id/members/:userId/promote', [
      ConversationController,
      'promoteMember',
    ])
    router.post('/conversations/:id/members/:userId/remove', [
      ConversationController,
      'removeMember',
    ])
    router.get('/users/search', [ConversationController, 'users'])
    router.get('/users/:id/profile', [ConversationController, 'memberProfile'])
    router.post('/users/:id/conversation', [ConversationController, 'startPrivate'])
    router.get('/users/:id/avatar', [AccountController, 'avatar'])
    router.post('/users/:id/block', [ConversationController, 'block'])
    router.post('/users/:id/unblock', [AccountController, 'unblock'])
    router.get('/search', [ConversationController, 'search'])
    router.get('/events', [EventsController, 'stream'])
    router.get('/profile', [AccountController, 'profile'])
    router.post('/profile', [AccountController, 'update'])
    router.post('/profile/avatar', [AccountController, 'updateAvatar'])
    router.post('/profile/password', [AccountController, 'password'])
    router.post('/logout', [SessionController, 'destroy']).as('session.destroy')
  })
  .use([middleware.auth(), middleware.validIds()])
