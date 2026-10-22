import { BOAT_ACTOR_TYPE } from "./constants.js";

class BoatDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const count = () => new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 });
    return {
      attributes: new fields.SchemaField({
        ac: new fields.SchemaField({ value: new fields.NumberField({ integer: true, initial: 10, min: 0 }) }),
        hp: new fields.SchemaField({ value: count(), max: count() }),
      }),
      vesselType: new fields.StringField({ initial: "" }),
      speed: new fields.StringField({ initial: "" }),
      crewCapacity: count(), passengerCapacity: count(), cargoCapacity: count(),
      crew: new fields.ArrayField(new fields.SchemaField({
        actorUuid: new fields.StringField({ required: true, blank: false }),
        name: new fields.StringField({ initial: "" }), role: new fields.StringField({ initial: "" }),
      })),
      notes: new fields.HTMLField(),
    };
  }
}

function registerBoatDataModel() {
  const models = globalThis.CONFIG?.Actor?.dataModels;
  if (!models) return false;
  models[BOAT_ACTOR_TYPE] = BoatDataModel;
  return true;
}

export { BoatDataModel, registerBoatDataModel };
