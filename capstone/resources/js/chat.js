import { isSticker } from './expressions.js'
import { confirmAction } from './confirmation.js'

const root = document.querySelector('.messenger-layout')

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function fillGroupAvatar(avatar, members) {
  const signature = JSON.stringify(members)
  if (avatar.dataset.members === signature) return
  avatar.dataset.members = signature
  avatar.classList.add('group-avatar')
  avatar.setAttribute('role', 'img')
  avatar.setAttribute('aria-label', 'Mosaïque des membres du groupe')
  avatar.removeAttribute('aria-hidden')
  avatar.style.setProperty('--avatar-columns', Math.ceil(Math.sqrt(members.length || 1)))
  avatar.replaceChildren()
  for (const member of members) {
    const tile = element(member.avatar ? 'img' : 'span', '', member.avatar ? undefined : (member.fullName || 'M').charAt(0).toUpperCase())
    if (member.avatar) {
      tile.src = `/users/${member.id}/avatar?v=${encodeURIComponent(member.avatar)}`
      tile.alt = ''
    } else tile.setAttribute('aria-hidden', 'true')
    avatar.append(tile)
  }
}

if (root) {
  const conversationId = Number(root.dataset.conversationId || 0)
  const userId = Number(root.dataset.userId || 0)
  const history = root.dataset.history === 'true'
  const form = document.querySelector('#message-form')
  const messages = document.querySelector('.chat-messages')
  const error = document.querySelector('#chat-error')
  const status = document.querySelector('#connection-status')
  const csrf = document.querySelector('input[name="_csrf"]')?.value
  const draftKey = `kadea-role-draft-${userId}-${conversationId}`
  try {
    const draft = sessionStorage.getItem(draftKey)
    if (draft && form) form.querySelector('textarea').value = draft
    sessionStorage.removeItem(draftKey)
  } catch { /* The chat also works without browser storage. */ }
  let previousMessages = ''
  let previousConversations = ''
  let lastRead = 0
  let latestReceived = 0
  let sending = false
  let blocked = false
  let removed = root.dataset.removed === 'true'
  let previousReadOnlyMembers = ''

  function renderRemovedMembers(members) {
    const container = document.querySelector('[data-group-members]')
    if (!container) return
    const signature = JSON.stringify(members)
    if (signature === previousReadOnlyMembers) return
    previousReadOnlyMembers = signature
    container.replaceChildren()
    for (const member of members) {
      const row = element('div', 'member-row')
      if (member.avatar) {
        const photo = element('img', 'member-photo')
        photo.src = `/users/${member.id}/avatar?v=${encodeURIComponent(member.avatar)}`
        photo.alt = ''
        row.append(photo)
      }
      const link = element('a', 'member-profile-link', `${member.fullName || 'Membre'}${member.is_admin ? ' · Admin' : ''}`)
      link.href = `/users/${member.id}/profile`
      row.append(link)
      const direct = element('form')
      direct.method = 'POST'
      direct.action = `/users/${member.id}/conversation`
      const token = element('input')
      token.type = 'hidden'
      token.name = '_csrf'
      token.value = csrf
      const button = element('button', 'btn btn--secondary', 'Message privé')
      button.type = 'submit'
      direct.append(token, button)
      row.append(direct)
      container.append(row)
    }
  }

  function messageMenu(id, mine, createdAt, deleted) {
    if (deleted && mine) return null
    const menu = element('details', 'message-actions')
    const toggle = element('summary', 'message-actions__toggle', '⋮')
    toggle.setAttribute('aria-label', 'Options du message')
    const list = element('div', 'message-actions__list')
    if (mine && !deleted && !removed) {
      const edit = element('button', 'message-edit', 'Modifier')
      edit.type = 'button'
      edit.dataset.editMessage = String(id)
      edit.dataset.expires = String(new Date(createdAt).getTime() + 300000)
      edit.disabled = Date.now() >= Number(edit.dataset.expires)
      edit.title = 'Modification possible pendant 5 minutes après envoi'
      list.append(edit)
    }
    const remove = element('button', 'message-delete', mine ? 'Supprimer pour tous' : 'Supprimer pour moi')
    remove.type = 'button'
    remove.dataset.deleteMessage = String(id)
    remove.dataset.mine = String(mine)
    list.append(remove)
    menu.append(toggle, list)
    menu.addEventListener('toggle', () => {
      if (!menu.open) return
      for (const other of messages.querySelectorAll('.message-actions[open]')) {
        if (other !== menu) other.open = false
      }
      const edit = menu.querySelector('[data-edit-message]')
      if (edit) edit.disabled = Date.now() >= Number(edit.dataset.expires)
      list.style.transform = ''
      const bounds = list.getBoundingClientRect()
      const shift = Math.max(8 - bounds.left, Math.min(0, window.innerWidth - 8 - bounds.right))
      list.style.transform = `translateX(${shift}px)`
    })
    return menu
  }
  setInterval(() => {
    messages?.querySelectorAll('[data-expires]').forEach((button) => {
      button.disabled = Date.now() >= Number(button.dataset.expires)
    })
  }, 1000)
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.message-actions')) {
      messages?.querySelectorAll('.message-actions[open]').forEach((menu) => { menu.open = false })
    }
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') messages?.querySelectorAll('.message-actions[open]').forEach((menu) => { menu.open = false })
  })
  // Enhance server-rendered history as well as the live message list.
  messages?.querySelectorAll('[data-message-actions]').forEach((slot) => {
    const menu = messageMenu(slot.dataset.messageActions, slot.dataset.mine === 'true', slot.dataset.createdAt, slot.dataset.deleted === 'true')
    if (menu) {
      slot.replaceWith(menu)
    }
  })

  async function post(url, body, method = 'POST') {
    const result = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRF-TOKEN': csrf,
      },
      body: JSON.stringify(body || {}),
    })
    if (result.redirected) {
      location.assign('/login')
      throw new Error('Session expirée.')
    }
    if (!result.ok) {
      const data = await result.json().catch(() => ({}))
      throw new Error(data.message || data.errors?.[0]?.message || 'Action impossible. Réessayez.')
    }
    return result
  }

  function markRead() {
    if (
      !conversationId ||
      history ||
      document.querySelector('dialog[open]') ||
      document.hidden ||
      !document.hasFocus() ||
      latestReceived <= lastRead
    )
      return
    lastRead = latestReceived
    post(`/conversations/${conversationId}/read`).catch(() => {
      lastRead = 0
    })
  }

  function renderConversations(rows) {
    const serialized = JSON.stringify(rows)
    if (serialized === previousConversations) return
    previousConversations = serialized
    const currentGroup = rows.find((row) => row.id === conversationId && row.type === 'group')
    if (currentGroup) {
      document.querySelectorAll('.chat-header [data-group-avatar], #members-dialog [data-group-avatar]').forEach((avatar) => fillGroupAvatar(avatar, currentGroup.avatarMembers || []))
    }
    const list = document.querySelector('.conversation-list')
    const query = (document.querySelector('.conversation-search input')?.value || '').toLowerCase()
    list.replaceChildren()
    for (const row of rows) {
      const link = element(
        'a',
        `conversation-row${row.id === conversationId ? ' conversation-row--active' : ''}`
      )
      link.href = `/conversations/${row.id}`
      const preview = row.lastMessage?.body || 'Démarrer la conversation'
      link.dataset.conversation = `${row.displayName} ${preview}`.toLowerCase()
      link.hidden = !!query && !link.dataset.conversation.includes(query)
      const avatar = element(
        row.type === 'private' && row.other_avatar ? 'img' : 'span',
        `conversation-avatar${row.type === 'group' ? ' conversation-avatar--group' : ''}`,
        row.type === 'group' ? '' : row.displayName.charAt(0).toUpperCase()
      )
      if (row.type === 'private' && row.other_avatar) {
        avatar.src = `/users/${row.other_user_id}/avatar?v=${encodeURIComponent(row.other_avatar)}`
        avatar.alt = ''
      }
      if (row.type === 'group') {
        fillGroupAvatar(avatar, row.avatarMembers || [])
      }
      link.append(avatar)
      const content = element('span', 'conversation-row__content')
      const top = element('span', 'conversation-row__top')
      const time = element('time', '', row.lastMessageTime)
      if (row.last_message_at) time.title = new Date(row.last_message_at).toLocaleString('fr-FR')
      top.append(element('strong', '', row.displayName), time)
      content.append(top, element('span', 'conversation-row__preview', preview))
      if (row.unread) content.append(element('span', 'unread-badge', String(row.unread)))
      link.append(content)
      list.append(link)
    }
    updateFilter()
    const count = document.querySelector('.conversation-list-heading h1 span')
    if (count) count.textContent = String(rows.length)
  }

  function renderMessages(rows, members) {
    latestReceived = rows.filter((row) => row.user_id !== userId).at(-1)?.id || 0
    markRead()
    if (!messages || history) return
    const serialized = JSON.stringify([rows, members])
    if (serialized === previousMessages) return
    const first = previousMessages === ''
    previousMessages = serialized
    const nearBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 120
    const previousScroll = messages.scrollTop
    messages.replaceChildren()
    if (rows.length === 100) {
      const older = element('a', 'history-link', 'Voir les messages précédents')
      older.href = `/conversations/${conversationId}?before=${rows[0].id}`
      messages.append(older)
    }
    if (!rows.length)
      messages.append(
        element('p', 'chat-empty', 'La conversation commence ici. Envoyez votre premier message.')
      )
    let previousDate = ''
    for (const row of rows) {
      const date = new Date(row.created_at).toLocaleDateString('fr-FR', {
        timeZone: 'Africa/Lagos',
      })
      if (date !== previousDate) {
        const today = new Date().toLocaleDateString('fr-FR', { timeZone: 'Africa/Lagos' })
        messages.append(element('span', 'date-divider', date === today ? 'Aujourd’hui' : date))
        previousDate = date
      }
      const mine = row.user_id === userId
      if (row.event_kind) {
        const notice = element('div', 'group-system-event')
        notice.id = `message-${row.id}`
        notice.setAttribute('role', 'status')
        notice.append(element('span', '', row.body), element('time', '', row.timeLabel))
        messages.append(notice)
        continue
      }
      const article = element('article', `message ${mine ? 'message--mine' : 'message--received'}`)
      if (!row.deleted_at && isSticker(row.body)) article.classList.add('message--sticker')
      article.id = `message-${row.id}`
      const content = element('div', 'message__content')
      const stack = element('div', 'message-stack')
      const metadata = element('div', 'message-timestamp')
      if (!mine) {
        const author = members.find((member) => member.id === row.user_id)
        const avatar = element(
          author?.avatar ? 'img' : 'span',
          'message-avatar',
          author?.avatar ? undefined : (row.author_name || 'M').charAt(0).toUpperCase()
        )
        if (author?.avatar) {
          avatar.src = `/users/${author.id}/avatar?v=${encodeURIComponent(author.avatar)}`
          avatar.alt = ''
        }
        article.append(avatar)
        const authorLink = element('a', 'message__author', row.author_name || 'Membre')
        authorLink.href = `/users/${row.user_id}/profile`
        content.append(authorLink)
      }
      content.append(
        element(
          'p',
          row.deleted_at ? 'message-deleted' : '',
          row.deleted_at ? 'Ce message a été supprimé.' : row.body
        )
      )
      const time = element('time', '', row.timeLabel)
      time.dateTime = new Date(row.created_at).toISOString()
      metadata.append(time)
      if (mine && !row.deleted_at) {
        const others = members.filter((member) => member.id !== userId)
        const allRead =
          others.length &&
          others.every(
            (member) =>
              member.last_read_at && new Date(member.last_read_at) >= new Date(row.created_at)
          )
        const allDelivered =
          others.length &&
          others.every(
            (member) =>
              member.last_delivered_at &&
              new Date(member.last_delivered_at) >= new Date(row.created_at)
          )
        metadata.append(
          element(
            'span',
            `message-status${allRead ? ' message-status--read' : ''}`,
            allRead ? '✓✓ Lu' : allDelivered ? '✓✓ Reçu' : '✓ Envoyé'
          )
        )
      }
      const menu = messageMenu(row.id, mine, row.created_at, !!row.deleted_at)
      if (menu) metadata.insertBefore(menu, time.nextSibling)
      if (removed) metadata.querySelector('[data-edit-message]')?.remove()
      if (row.edited_at) metadata.append(element('span', 'message-edited', 'Modifié'))
      stack.append(content, metadata)
      article.append(stack)
      messages.append(article)
    }
    messages.scrollTop = first || nearBottom ? messages.scrollHeight : previousScroll
  }

  let source
  function connect() {
    source = new EventSource(`/events?conversation=${conversationId}`)
    source.addEventListener('snapshot', (event) => {
      status.hidden = true
      const data = JSON.parse(event.data)
      if (conversationId && root.dataset.isAdmin !== String(data.isAdmin)) {
        try { if (form) sessionStorage.setItem(draftKey, form.querySelector('textarea').value) } catch { /* Preserve server authorization even without storage. */ }
        source.close()
        location.reload()
        return
      }
      removed = !!data.removal
      const addition = document.querySelector('#group-addition-notice')
      if (addition) {
        addition.hidden = !data.addition
        addition.textContent = data.addition ? `${data.addition.by} vous a ajouté au groupe.` : ''
      }
      blocked = data.blocked || removed
      const notice = document.querySelector('#group-removal-notice')
      if (notice) {
        notice.hidden = !removed
        notice.textContent = removed ? `${data.removal.by} vous a retiré du groupe. Vous pouvez consulter l’historique et les membres, mais vous ne pouvez plus envoyer de messages.` : ''
      }
      if (removed) {
        renderRemovedMembers(data.members)
        const count = document.querySelector('.chat-header__status')
        if (count) count.textContent = `${data.members.length} membres`
      }
      renderConversations(data.conversations)
      renderMessages(data.messages, data.members)
      if (form) {
        form.querySelector('textarea').disabled = blocked
        form.querySelector('textarea').placeholder = removed ? 'Vous ne faites plus partie de ce groupe' : 'Écrivez votre message...'
        form.querySelector('button[type="submit"]').disabled = blocked || sending
        form.querySelector('[data-open-dialog="expression-dialog"]').disabled = blocked
        if (removed) error.textContent = ''
        else if (data.blocked)
          error.textContent =
            'Cette conversation est bloquée. Gérez les blocages depuis votre profil.'
        else if (error.textContent.startsWith('Cette conversation est bloquée'))
          error.textContent = ''
      }
    })
    source.addEventListener('removed', () => {
      source.close()
      location.assign('/dashboard')
    })
    source.addEventListener('expired', async () => {
      source.close()
      // A password changed in our own profile panel updates the shared cookie.
      const session = await fetch('/users/search?q=', {
        headers: { Accept: 'application/json' },
      }).catch(() => null)
      if (session?.ok && !session.redirected) connect()
      else location.assign('/login')
    })
    source.onopen = () => {
      status.hidden = true
    }
    source.onerror = () => {
      status.hidden = false
      status.textContent = 'Connexion interrompue. Reconnexion automatique…'
    }
  }
  connect()
  document.querySelectorAll('.message').forEach((message) => {
    if (isSticker(message.querySelector('p')?.textContent)) message.classList.add('message--sticker')
  })
  document.addEventListener('send-sticker', async (event) => {
    if (!form || sending || blocked || !isSticker(event.detail)) return
    sending = true
    const button = form.querySelector('[type="submit"]')
    button.disabled = true
    error.textContent = ''
    try {
      await post(form.action, { body: event.detail })
    } catch (failure) {
      error.textContent = failure.message
    } finally {
      sending = false
      button.disabled = blocked
    }
  })
  window.addEventListener('pagehide', () => source.close())
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) location.reload()
  })
  window.addEventListener('focus', markRead)
  document.addEventListener('visibilitychange', markRead)
  document.addEventListener('chat-visible', markRead)

  form?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const textarea = form.querySelector('textarea')
    const button = form.querySelector('button[type="submit"]')
    if (button.disabled || !textarea.value.trim()) return
    sending = true
    button.disabled = true
    textarea.readOnly = true
    button.textContent = '…'
    error.textContent = ''
    try {
      await post(form.action, { body: textarea.value })
      textarea.value = ''
    } catch (failure) {
      error.textContent = failure.message
    } finally {
      sending = false
      button.disabled = blocked
      textarea.readOnly = false
      button.textContent = '➤'
      textarea.focus()
    }
  })
  form?.querySelector('textarea').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      form.requestSubmit()
    }
  })
  messages?.addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit-message]')
    if (edit) {
      if (Date.now() >= Number(edit.dataset.expires)) {
        edit.disabled = true
        return
      }
      const article = edit.closest('article')
      const dialog = document.createElement('dialog')
      dialog.className = 'message-edit-dialog'
      const heading = element('h2', '', 'Modifier le message')
      const editor = element('textarea')
      editor.value = article.querySelector('p').textContent
      editor.maxLength = 5000
      editor.required = true
      editor.setAttribute('aria-label', 'Message à modifier')
      const actions = element('div', 'message-edit-dialog__actions')
      const cancel = element('button', 'btn btn--secondary', 'Annuler')
      cancel.type = 'button'
      const save = element('button', 'btn btn--primary', 'Enregistrer')
      save.type = 'submit'
      const editForm = element('form')
      const feedback = element('p', 'inline-error')
      feedback.setAttribute('role', 'alert')
      actions.append(cancel, save)
      editForm.append(heading, editor, feedback, actions)
      dialog.append(editForm)
      document.body.append(dialog)
      dialog.addEventListener('close', () => dialog.remove())
      cancel.addEventListener('click', () => dialog.close())
      editForm.addEventListener('submit', async (submit) => {
        submit.preventDefault()
        if (!editor.value.trim()) return
        save.disabled = true
        try {
          await post(`/conversations/${conversationId}/messages/${edit.dataset.editMessage}`, { body: editor.value }, 'PATCH')
          article.querySelector('p').textContent = editor.value
          if (!article.querySelector('.message-edited')) article.querySelector('.message-timestamp').append(element('span', 'message-edited', 'Modifié'))
          dialog.close()
        } catch (failure) {
          feedback.textContent = failure.message
          save.disabled = false
        }
      })
      edit.closest('details').open = false
      dialog.showModal()
      editor.focus()
      return
    }
    const button = event.target.closest('[data-delete-message]')
    if (!button) return
    const mine = button.dataset.mine === 'true'
    const messageId = button.dataset.deleteMessage
    if (!(await confirmAction(mine ? 'Supprimer ce message pour tous les participants ? Cette action est définitive.' : 'Supprimer ce message uniquement pour vous ? Il ne sera plus visible dans votre historique.', 'Supprimer le message'))) return
    button.disabled = true
    try {
      await post(
        `/conversations/${conversationId}/messages/${messageId}`,
        {},
        'DELETE'
      )
      const article = document.getElementById(`message-${messageId}`)
      if (!article) return
      if (!mine) {
        article.remove()
        return
      }
      article.querySelector('p').textContent = 'Ce message a été supprimé.'
      article.querySelector('.message-actions')?.remove()
    } catch (failure) {
      error.textContent = failure.message
      button.disabled = false
    }
  })

  const search = document.querySelector('#user-search')
  let searchController
  search?.addEventListener('input', async () => {
    searchController?.abort()
    searchController = new AbortController()
    const results = document.querySelector('#user-results')
    const query = search.value.trim()
    results.replaceChildren()
    if (query.length < 2) return
    try {
      const response = await fetch(`/users/search?q=${encodeURIComponent(query)}`, {
        signal: searchController.signal,
        headers: { Accept: 'application/json' },
      })
      if (!response.ok || response.redirected) throw new Error()
      const users = await response.json()
      if (!users.length) results.textContent = 'Aucun membre trouvé.'
      for (const user of users) {
        const button = element('button', 'user-result', `${user.full_name} · ${user.email}`)
        button.type = 'button'
        button.addEventListener('click', () => {
          document.querySelector('#new-chat-email').value = user.email
          document.querySelector('#new-chat-email').focus()
        })
        results.append(button)
      }
    } catch (failure) {
      if (failure.name !== 'AbortError') results.textContent = 'Recherche indisponible. Réessayez.'
    }
  })
  function updateFilter() {
    const query = (document.querySelector('.conversation-search input')?.value || '').toLowerCase()
    const rows = [...document.querySelectorAll('.conversation-row')]
    for (const link of rows) link.hidden = !link.dataset.conversation.includes(query)
    const empty = document.querySelector('#conversation-empty')
    if (empty) {
      empty.hidden = rows.some((link) => !link.hidden)
      empty.textContent = query
        ? 'Aucune discussion ne correspond à votre recherche.'
        : 'Vos discussions commencent ici. Écrivez à un membre de Kadea Academy.'
    }
  }
  document.querySelector('.conversation-search input')?.addEventListener('input', updateFilter)
}
