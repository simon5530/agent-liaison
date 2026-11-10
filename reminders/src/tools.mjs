// This file defines the narrow surface; it does NOT register a live plugin.
export const toolSchemas = Object.freeze({
  reminder_create: {
    type:'object',additionalProperties:false,required:['content','date'],properties:{
      content:{type:'string',minLength:1,maxLength:300},
      date:{type:'string',pattern:'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'},
    },
  },
  reminder_status:{type:'object',additionalProperties:false,properties:{}},
  reminder_cancel:{type:'object',additionalProperties:false,properties:{}},
});
export function bindReminderTools(broker, trustedCapability) {
  const facade=broker.bindTools(trustedCapability);
  return Object.freeze(Object.fromEntries(Object.entries({reminder_create:'create',reminder_status:'status',reminder_cancel:'cancel'}).map(([name,operation])=>[name,Object.freeze({
    name,parameters:toolSchemas[name],
    execute(args){
      if(!args || typeof args!=='object' || Array.isArray(args)) throw new Error('invalid-input');
      if(operation!=='create' && Object.keys(args).length) throw new Error('unexpected-field');
      return facade[operation](args);
    },
  })])));
}
