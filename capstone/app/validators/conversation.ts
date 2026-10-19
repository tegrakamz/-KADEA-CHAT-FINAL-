import vine from '@vinejs/vine'

export const createConversationValidator = vine.create({
  email: vine.string().email().maxLength(254),
})

export const sendMessageValidator = vine.create({
  body: vine.string().trim().minLength(1).maxLength(5000),
})
