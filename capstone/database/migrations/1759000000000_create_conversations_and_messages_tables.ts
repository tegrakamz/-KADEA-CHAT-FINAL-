import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('conversations', (table) => {
      table.increments('id').primary()
      table.string('name').nullable()
      table.string('type').notNullable().defaultTo('private')
      table.integer('created_by').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })

    this.schema.createTable('conversation_members', (table) => {
      table.increments('id').primary()
      table.integer('conversation_id').unsigned().notNullable().references('id').inTable('conversations').onDelete('CASCADE')
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.boolean('is_admin').notNullable().defaultTo(false)
      table.timestamp('created_at').notNullable()
      table.unique(['conversation_id', 'user_id'])
      table.index(['user_id', 'conversation_id'])
    })

    this.schema.createTable('messages', (table) => {
      table.increments('id').primary()
      table.integer('conversation_id').unsigned().notNullable().references('id').inTable('conversations').onDelete('CASCADE')
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.text('body').notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('deleted_at').nullable()
      table.index(['conversation_id', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable('messages')
    this.schema.dropTable('conversation_members')
    this.schema.dropTable('conversations')
  }
}
