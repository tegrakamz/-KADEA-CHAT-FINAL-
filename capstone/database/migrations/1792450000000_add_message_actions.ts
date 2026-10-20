import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('messages', (table) => {
      table.timestamp('edited_at').nullable()
    })
    this.schema.createTable('message_hides', (table) => {
      table
        .integer('message_id')
        .notNullable()
        .references('id')
        .inTable('messages')
        .onDelete('CASCADE')
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.primary(['message_id', 'user_id'])
    })
  }

  async down() {
    this.schema.dropTable('message_hides')
    this.schema.alterTable('messages', (table) => table.dropColumn('edited_at'))
  }
}
