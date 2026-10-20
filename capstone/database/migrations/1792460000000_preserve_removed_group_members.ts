import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('conversation_members', (table) => {
      table.timestamp('removed_at').nullable()
      table.integer('removed_by').nullable().references('id').inTable('users').onDelete('SET NULL')
      table.string('removed_by_name').nullable()
    })
  }
  async down() {
    this.schema.alterTable('conversation_members', (table) => {
      table.dropColumn('removed_at')
      table.dropColumn('removed_by')
      table.dropColumn('removed_by_name')
    })
  }
}
