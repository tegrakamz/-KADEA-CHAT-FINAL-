const dialog = document.createElement('dialog')
dialog.id = 'action-confirmation'
dialog.className = 'chat-dialog'
dialog.setAttribute('aria-labelledby', 'action-confirmation-title')
dialog.setAttribute('aria-describedby', 'action-confirmation-description')
dialog.innerHTML = '<section class="dialog-card"><h2 id="action-confirmation-title"></h2><p id="action-confirmation-description"></p><div class="dialog-actions"><button type="button" class="btn btn--secondary" data-confirm-no autofocus>Non</button><button type="button" class="btn btn--primary" data-confirm-yes>Oui, confirmer</button></div></section>'
document.body.append(dialog)
let resolvePending
let accepted = false
let previousFocus

export function confirmAction(message, title = 'Confirmer cette action') {
  if (dialog.open) return Promise.resolve(false)
  previousFocus = document.activeElement
  accepted = false
  dialog.querySelector('h2').textContent = title
  dialog.querySelector('p').textContent = message
  return new Promise((resolve) => {
    resolvePending = resolve
    dialog.showModal()
    dialog.querySelector('[data-confirm-no]').focus()
  })
}

dialog.querySelector('[data-confirm-no]').addEventListener('click', () => dialog.close())
dialog.querySelector('[data-confirm-yes]').addEventListener('click', () => {
  accepted = true
  dialog.close()
})
dialog.addEventListener('close', () => {
  const resolve = resolvePending
  resolvePending = null
  if (previousFocus?.isConnected) previousFocus.focus()
  resolve?.(accepted)
})

const approved = new WeakSet()
const waiting = new WeakSet()
document.addEventListener('submit', async (event) => {
  const form = event.target
  if (!(form instanceof HTMLFormElement) || !form.dataset.confirmAction) return
  if (approved.has(form)) {
    approved.delete(form)
    return
  }
  event.preventDefault()
  // Prevent loading indicators from disabling the form before confirmation.
  event.stopImmediatePropagation()
  if (waiting.has(form)) return
  waiting.add(form)
  const submitter = event.submitter
  let message = form.dataset.confirmAction
  const email = form.querySelector('input[name="email"]')?.value
  if (email) message += ` Adresse : ${email}.`
  const confirmed = await confirmAction(message, form.dataset.confirmTitle)
  waiting.delete(form)
  if (!confirmed || !form.isConnected) return
  approved.add(form)
  form.requestSubmit(submitter?.isConnected ? submitter : undefined)
}, true)
