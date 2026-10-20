export const isSticker = (body) => typeof body === 'string' && /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F|\u200D){1,16}$/u.test(body.trim())

const dialog = document.querySelector('#expression-dialog')
const form = document.querySelector('#message-form')
if (dialog && form) {
  const emojis = ['😀', '😂', '😊', '😍', '🥰', '😎', '🥳', '🤔', '😭', '😴', '👍', '👏', '🙏', '💪', '❤️', '🔥', '✨', '🎉', '✅', '👋', '🤝', '💡', '🚀', '💛']
  const stickers = ['🦊', '🐼', '🐱', '🐸', '🦄', '🐻', '🥳', '🤩', '😍', '😭', '🚀', '🎉']
  for (const [items, selector, sticker] of [[emojis, '[data-emoji-grid]', false], [stickers, '[data-sticker-grid]', true]]) {
    for (const symbol of items) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = symbol
      button.setAttribute('aria-label', `${sticker ? 'Envoyer le sticker' : 'Insérer l’émoji'} ${symbol}`)
      button.addEventListener('click', () => {
        const textarea = form.querySelector('textarea')
        const send = form.querySelector('[type="submit"]')
        if (textarea.disabled || textarea.readOnly || send.disabled) return
        const feedback = dialog.querySelector('[data-expression-error]')
        if (sticker) {
          document.dispatchEvent(new CustomEvent('send-sticker', { detail: symbol }))
        } else {
          if (textarea.value.length + symbol.length > textarea.maxLength) {
            feedback.textContent = 'Le message est trop long pour ajouter cet émoji.'
            return
          }
          textarea.setRangeText(symbol, textarea.selectionStart, textarea.selectionEnd, 'end')
          textarea.dispatchEvent(new Event('input', { bubbles: true }))
        }
        dialog.close()
        textarea.focus()
      })
      dialog.querySelector(selector).append(button)
    }
  }
}
