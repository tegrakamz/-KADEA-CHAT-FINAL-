import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('messages', (table) => {
      table.string('event_kind').nullable()
      table.string('event_actor_name').nullable()
      table.string('event_target_name').nullable()
    })
  }
  async down() {
    this.schema.alterTable('messages', (table) => {
      table.dropColumn('event_kind')
      table.dropColumn('event_actor_name')
      table.dropColumn('event_target_name')
    })
  }
}
