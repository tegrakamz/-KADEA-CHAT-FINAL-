/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { middleware } from '#start/kernel'
import { controllers } from '#generated/controllers'
import router from '@adonisjs/core/services/router'
import ConversationController from '#controllers/conversation_controller'

router.on('/').render('pages/home').as('home')

router
  .group(() => {
    router.get('signup', [controllers.NewAccount, 'create'])
    router.post('signup', [controllers.NewAccount, 'store'])

    router.get('login', [controllers.Session, 'create'])
    router.post('login', [controllers.Session, 'store'])
  })
  .use(middleware.guest())

router
  .group(() => {
    router.get('/dashboard', [ConversationController, 'index']).as('dashboard')
    router.post('/conversations', [ConversationController, 'store']).as('conversations.store')
    router.get('/conversations/:id', [ConversationController, 'show']).as('conversations.show')
    router.post('/conversations/:id/messages', [ConversationController, 'sendMessage']).as('messages.store')
    router.post('logout', [controllers.Session, 'destroy'])
  })
  .use(middleware.auth())
