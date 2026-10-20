import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'home': { paramsTuple?: []; params?: {} }
    'new_account.create': { paramsTuple?: []; params?: {} }
    'new_account.store': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'session.store': { paramsTuple?: []; params?: {} }
    'account.verification': { paramsTuple?: []; params?: {} }
    'account.resend': { paramsTuple?: []; params?: {} }
    'account.verify': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'account.forgot': { paramsTuple?: []; params?: {} }
    'account.forgot.send': { paramsTuple?: []; params?: {} }
    'account.reset_form': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'account.reset': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'dashboard': { paramsTuple?: []; params?: {} }
    'conversations.store': { paramsTuple?: []; params?: {} }
    'conversation.group': { paramsTuple?: []; params?: {} }
    'conversations.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'messages.store': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'conversation.delete_message': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'messageId': ParamValue} }
    'conversation.edit_message': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'messageId': ParamValue} }
    'conversation.read': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'conversation.add_member': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'conversation.promote_member': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'userId': ParamValue} }
    'conversation.remove_member': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'userId': ParamValue} }
    'conversation.users': { paramsTuple?: []; params?: {} }
    'conversation.member_profile': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'conversation.start_private': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'account.avatar': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'conversation.block': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'account.unblock': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'conversation.search': { paramsTuple?: []; params?: {} }
    'events.stream': { paramsTuple?: []; params?: {} }
    'account.profile': { paramsTuple?: []; params?: {} }
    'account.update': { paramsTuple?: []; params?: {} }
    'account.update_avatar': { paramsTuple?: []; params?: {} }
    'account.password': { paramsTuple?: []; params?: {} }
    'session.destroy': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'home': { paramsTuple?: []; params?: {} }
    'new_account.create': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'account.verification': { paramsTuple?: []; params?: {} }
    'account.verify': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'account.forgot': { paramsTuple?: []; params?: {} }
    'account.reset_form': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'dashboard': { paramsTuple?: []; params?: {} }
    'conversations.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'conversation.users': { paramsTuple?: []; params?: {} }
    'conversation.member_profile': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'account.avatar': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'conversation.search': { paramsTuple?: []; params?: {} }
    'events.stream': { paramsTuple?: []; params?: {} }
    'account.profile': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'home': { paramsTuple?: []; params?: {} }
    'new_account.create': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'account.verification': { paramsTuple?: []; params?: {} }
    'account.verify': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'account.forgot': { paramsTuple?: []; params?: {} }
    'account.reset_form': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'dashboard': { paramsTuple?: []; params?: {} }
    'conversations.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'conversation.users': { paramsTuple?: []; params?: {} }
    'conversation.member_profile': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'account.avatar': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'conversation.search': { paramsTuple?: []; params?: {} }
    'events.stream': { paramsTuple?: []; params?: {} }
    'account.profile': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'new_account.store': { paramsTuple?: []; params?: {} }
    'session.store': { paramsTuple?: []; params?: {} }
    'account.resend': { paramsTuple?: []; params?: {} }
    'account.forgot.send': { paramsTuple?: []; params?: {} }
    'account.reset': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'conversations.store': { paramsTuple?: []; params?: {} }
    'conversation.group': { paramsTuple?: []; params?: {} }
    'messages.store': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'conversation.read': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'conversation.add_member': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'conversation.promote_member': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'userId': ParamValue} }
    'conversation.remove_member': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'userId': ParamValue} }
    'conversation.start_private': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'conversation.block': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'account.unblock': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'account.update': { paramsTuple?: []; params?: {} }
    'account.update_avatar': { paramsTuple?: []; params?: {} }
    'account.password': { paramsTuple?: []; params?: {} }
    'session.destroy': { paramsTuple?: []; params?: {} }
  }
  DELETE: {
    'conversation.delete_message': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'messageId': ParamValue} }
  }
  PATCH: {
    'conversation.edit_message': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'messageId': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}