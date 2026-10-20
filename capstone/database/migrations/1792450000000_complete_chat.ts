import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('users', (table) => {
      table.timestamp('email_verified_at').nullable()
      table.string('avatar').nullable()
    })
    this.schema.alterTable('conversation_members', (table) => {
      table.timestamp('last_read_at').nullable()
      table.timestamp('last_delivered_at').nullable()
    })
    this.schema.createTable('account_tokens', (table) => {
      table.increments('id')
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.string('token_hash', 64).notNullable().unique()
      table.string('purpose').notNullable()
      table.timestamp('expires_at').notNullable()
      table.index(['user_id', 'purpose'])
    })
    this.schema.createTable('user_blocks', (table) => {
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table
        .integer('blocked_user_id')
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.primary(['user_id', 'blocked_user_id'])
    })
    this.schema.createTable('rate_limits', (table) => {
      table.string('key', 64).primary()
      table.integer('attempts').notNullable()
      table.timestamp('expires_at').notNullable().index()
    })
  }

  async down() {
    this.schema.dropTable('rate_limits')
    this.schema.dropTable('user_blocks')
    this.schema.dropTable('account_tokens')
    this.schema.alterTable('conversation_members', (table) => {
      table.dropColumn('last_read_at')
      table.dropColumn('last_delivered_at')
    })
    this.schema.alterTable('users', (table) => {
      table.dropColumn('avatar')
      table.dropColumn('email_verified_at')
    })
  }
}
