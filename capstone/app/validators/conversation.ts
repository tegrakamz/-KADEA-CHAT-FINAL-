import vine from '@vinejs/vine'

export const createConversationValidator = vine.create({
  email: vine.string().trim().toLowerCase().email().maxLength(254),
})

export const sendMessageValidator = vine.create({
  body: vine.string().trim().minLength(1).maxLength(5000),
})

export const groupValidator = vine.create({
  name: vine.string().trim().minLength(2).maxLength(100),
  emails: vine.string().trim().minLength(3).maxLength(5000),
})
