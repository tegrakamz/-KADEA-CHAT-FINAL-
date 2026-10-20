import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('conversation_members', (table) => {
      table.integer('added_by').nullable().references('id').inTable('users').onDelete('SET NULL')
      table.string('added_by_name').nullable()
    })
  }
  async down() {
    this.schema.alterTable('conversation_members', (table) => {
      table.dropColumn('added_by')
      table.dropColumn('added_by_name')
    })
  }
}
