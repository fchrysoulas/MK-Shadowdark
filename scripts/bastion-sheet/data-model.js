import { BASTION_ACTOR_TYPE } from "./constants.js";

class BastionDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      attributes: new fields.SchemaField({
        ac: new fields.SchemaField({
          value: new fields.NumberField({ integer: true, initial: 10, min: 0 }),
        }),
        hp: new fields.SchemaField({
          value: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
          max: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        }),
      }),
      coins: new fields.SchemaField({
        gp: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        sp: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        cp: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      }),
      location: new fields.StringField({ initial: "" }),
      notes: new fields.HTMLField(),
    };
  }
}

function registerBastionDataModel() {
  const dataModels = globalThis.CONFIG?.Actor?.dataModels;
  if (!dataModels) return false;

  dataModels[BASTION_ACTOR_TYPE] = BastionDataModel;
  return true;
}

export { BastionDataModel, registerBastionDataModel };
