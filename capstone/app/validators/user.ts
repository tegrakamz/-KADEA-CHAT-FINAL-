import vine from '@vinejs/vine'

/**
 * Shared rules for email and password.
 */
const email = () => vine.string().trim().toLowerCase().email().maxLength(254)
const password = () => vine.string().minLength(8).maxLength(128)

/**
 * Validator to use when performing self-signup
 */
export const signupValidator = vine.create({
  fullName: vine.string().trim().minLength(2).maxLength(100),
  email: email().unique({ table: 'users', column: 'email' }),
  password: password(),
  passwordConfirmation: password().sameAs('password'),
})

/**
 * Validator to use before validating user credentials
 * during login
 */
export const loginValidator = vine.create({
  email: email(),
  password: vine.string(),
})

export const emailValidator = vine.create({ email: email() })
export const resetValidator = vine.create({
  password: password(),
  passwordConfirmation: password().sameAs('password'),
})
export const profileValidator = vine.create({
  fullName: vine.string().trim().minLength(2).maxLength(100),
})
export const changePasswordValidator = vine.create({
  currentPassword: vine.string(),
  password: password(),
  passwordConfirmation: password().sameAs('password'),
})
