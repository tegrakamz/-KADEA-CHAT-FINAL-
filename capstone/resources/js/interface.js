import './confirmation.js'

function node(tag, className, text) {
  const result = document.createElement(tag)
  if (className) result.className = className
  if (text !== undefined) result.textContent = text
  return result
}

const profileDrawer = document.querySelector('#profile-drawer')
const frame = profileDrawer?.querySelector('iframe')
const logoutDialog = document.querySelector('#logout-dialog')
let pendingLogout
let logoutConfirmed = false
for (const form of document.querySelectorAll('form[action="/logout"]')) {
  form.addEventListener('submit', (event) => {
    if (!logoutDialog) return
    if (logoutConfirmed) return
    event.preventDefault()
    pendingLogout = form
    if (!logoutDialog.open) logoutDialog.showModal()
  })
}
logoutDialog?.querySelector('[data-confirm-logout]').addEventListener('click', (event) => {
  if (!pendingLogout) return
  logoutConfirmed = true
  event.currentTarget.disabled = true
  pendingLogout.requestSubmit()
})
logoutDialog?.addEventListener('close', () => {
  if (!logoutConfirmed) pendingLogout = null
})

for (const section of document.querySelectorAll('.profile-accordion')) {
  if (section.querySelector('.field__error')) section.open = true
}

document.addEventListener('click', (event) => {
  const opener = event.target.closest('[data-open-dialog], [data-profile-open]')
  if (opener) {
    const dialog = opener.hasAttribute('data-profile-open')
      ? profileDrawer
      : document.getElementById(opener.dataset.openDialog)
    if (!dialog) return
    event.preventDefault()
    if (dialog === profileDrawer) {
      profileDrawer.classList.remove('is-loaded')
      frame.src = '/profile'
    }
    dialog.showModal()
    dialog.querySelector('[aria-invalid="true"], input:not([type="hidden"]), textarea')?.focus()
  }
  const close = event.target.closest('[data-close-dialog]')
  close?.closest('dialog')?.close()
})

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (event) => {
    const bounds = dialog.getBoundingClientRect()
    if (
      event.target === dialog &&
      (event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom)
    )
      dialog.close()
  })
  dialog.addEventListener('close', () => document.dispatchEvent(new Event('chat-visible')))
  if (dialog.dataset.reopen === 'true') dialog.showModal()
}

frame?.addEventListener('load', () => {
  if (!profileDrawer.open || !frame.getAttribute('src')) return
  profileDrawer.classList.add('is-loaded')
  try {
    if (frame.contentWindow.location.pathname !== '/profile') {
      location.assign('/login')
      return
    }
  } catch {
    /* The panel accepts only our own origin. */
  }
})

window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.source !== frame?.contentWindow) return
  if (event.data?.type === 'close-profile') profileDrawer.close()
  if (event.data?.type === 'profile-updated') {
    const name = document.querySelector('.profile-copy strong')
    if (name) name.textContent = event.data.name
    const previousAvatar = document.querySelector('.profile-strip .profile-avatar')
    if (previousAvatar) {
      const imagePath =
        typeof event.data.avatar === 'string' ? new URL(event.data.avatar, location.origin) : null
      if (
        imagePath?.origin === location.origin &&
        /^\/users\/\d+\/avatar$/.test(imagePath.pathname)
      ) {
        const image = node('img', 'profile-avatar')
        image.src = `${imagePath.pathname}?v=${Date.now()}`
        image.alt = ''
        previousAvatar.replaceWith(image)
      } else previousAvatar.textContent = event.data.name?.slice(0, 2).toUpperCase() || 'K'
    }
  }
})

if (window.self !== window.top && location.pathname === '/profile') {
  document.documentElement.classList.add('embedded-profile')
  window.parent.postMessage(
    {
      type: 'profile-updated',
      name: document.querySelector('.profile-identity h1')?.textContent.trim(),
      avatar: document.querySelector('img.profile-photo')?.getAttribute('src'),
    },
    location.origin
  )
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape')
      window.parent.postMessage({ type: 'close-profile' }, location.origin)
  })
}

for (const form of document.querySelectorAll('[data-loading-form], .profile-page form')) {
  form.addEventListener('submit', (event) => {
    if (event.defaultPrevented) return
    const button = form.querySelector('button[type="submit"]')
    if (button) {
      button.disabled = true
      button.textContent = 'En cours…'
      form.setAttribute('aria-busy', 'true')
    }
  })
}

const photoInput = document.querySelector('.profile-page #avatar')
const quickPhoto = document.querySelector('#quick-avatar')
const photoButton = document.querySelector('[data-pick-profile-photo]')
photoButton?.addEventListener('click', () => quickPhoto?.click())
quickPhoto?.addEventListener('change', () => {
  const file = quickPhoto.files[0]
  if (!file) return
  const feedback = document.querySelector('#quick-avatar-error')
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
    feedback.textContent = 'Photo invalide : JPG, PNG ou WebP, maximum 2 Mo.'
    quickPhoto.value = ''
    return
  }
  feedback.textContent = ''
  photoButton.disabled = true
  photoButton.setAttribute('aria-busy', 'true')
  document.querySelector('#quick-avatar-form').requestSubmit()
})
let previewUrl
photoInput?.addEventListener('change', () => {
  const file = photoInput.files[0]
  if (
    !file ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 2 * 1024 * 1024
  )
    return
  if (previewUrl) URL.revokeObjectURL(previewUrl)
  previewUrl = URL.createObjectURL(file)
  const image = node('img', 'profile-photo')
  image.src = previewUrl
  image.alt = 'Aperçu de votre nouvelle photo'
  document.querySelector('.profile-identity .profile-photo')?.replaceWith(image)
})

const groupForm = document.querySelector('#group-form')
if (groupForm) {
  const emails = groupForm.querySelector('#group-members')
  const search = groupForm.querySelector('#group-search')
  const results = groupForm.querySelector('#group-results')
  const chips = groupForm.querySelector('#selected-members')
  const count = groupForm.querySelector('#group-count')
  const known = new Map()
  let selected = new Set()
  let controller
  let timer

  function sync() {
    selected = new Set(
      emails.value
        .split(/[\s,;]+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    )
    count.textContent = `${selected.size} sélectionné${selected.size > 1 ? 's' : ''}`
    chips.replaceChildren()
    for (const email of selected) {
      const chip = node('span', 'member-chip', known.get(email)?.full_name || email)
      const remove = node('button', '', '×')
      remove.type = 'button'
      remove.setAttribute('aria-label', `Retirer ${email}`)
      remove.addEventListener('click', () => {
        selected.delete(email)
        emails.value = [...selected].join('\n')
        sync()
      })
      chip.append(remove)
      chips.append(chip)
    }
    for (const checkbox of results.querySelectorAll('input[type="checkbox"]'))
      checkbox.checked = selected.has(checkbox.value)
    emails.setCustomValidity(selected.size > 50 ? 'Sélectionnez au maximum 50 membres.' : '')
  }

  emails.addEventListener('input', sync)
  sync()
  search.addEventListener('input', () => {
    clearTimeout(timer)
    controller?.abort()
    const query = search.value.trim()
    results.replaceChildren(
      node(
        'p',
        'picker-hint',
        query.length < 2 ? 'Saisissez au moins deux caractères.' : 'Recherche en cours…'
      )
    )
    if (query.length < 2) return
    timer = setTimeout(async () => {
      controller = new AbortController()
      try {
        const response = await fetch(`/users/search?q=${encodeURIComponent(query)}`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })
        if (!response.ok || response.redirected) throw new Error()
        const users = await response.json()
        results.replaceChildren()
        if (!users.length)
          results.append(node('p', 'picker-hint', 'Aucun membre trouvé. Essayez un autre nom.'))
        for (const user of users) {
          known.set(user.email.toLowerCase(), user)
          const label = node('label', 'picker-row')
          const avatar = node(
            user.avatar ? 'img' : 'span',
            'member-photo member-initials',
            user.avatar ? undefined : user.full_name?.charAt(0).toUpperCase() || 'K'
          )
          if (user.avatar) {
            avatar.src = `/users/${user.id}/avatar`
            avatar.alt = ''
          }
          const text = node('span', 'picker-identity')
          text.append(
            node('strong', '', user.full_name || user.email),
            node('small', '', user.email)
          )
          const checkbox = node('input')
          checkbox.type = 'checkbox'
          checkbox.value = user.email.toLowerCase()
          checkbox.checked = selected.has(checkbox.value)
          checkbox.addEventListener('change', () => {
            if (checkbox.checked) selected.add(checkbox.value)
            else selected.delete(checkbox.value)
            emails.value = [...selected].join('\n')
            sync()
          })
          label.append(avatar, text, checkbox)
          results.append(label)
        }
        sync()
      } catch (error) {
        if (error.name !== 'AbortError')
          results.replaceChildren(
            node(
              'p',
              'picker-hint',
              'Recherche indisponible. Vous pouvez saisir les adresses ci-dessous.'
            )
          )
      }
    }, 180)
  })
}

document.addEventListener('keydown', (event) => {
  if (
    event.key === '/' &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.target.closest('input, textarea, [contenteditable]') &&
    !document.querySelector('dialog[open]')
  ) {
    const input = document.querySelector('.conversation-search input')
    if (input) {
      event.preventDefault()
      input.focus()
    }
  }
})
