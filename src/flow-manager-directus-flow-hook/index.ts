import { defineHook } from "@directus/extensions-sdk";

export default defineHook(({ action }, { services, logger }) => {
  action("activity.create", async (data: any, { database, schema }) => {
    const {
      payload: { action, item: flowId },
    } = data;
    const { RevisionsService, FieldsService } = services;
    if (action === "run") {
      const revisionsService = new RevisionsService({
        knex: database,
        schema,
      });

      const fieldsService = new FieldsService({
        knex: database,
        schema,
      });

      const fields = await fieldsService.readAll("directus_flows");

      let isCounterFieldExists = false;
      let isCounterDateFieldExists = false;

      for (const field of fields) {
        if (field.field === "flow_manager_run_counter") {
          isCounterFieldExists = true;
        }

        if (field.field === "flow_manager_last_run_at") {
          isCounterDateFieldExists = true;
        }

        if (isCounterFieldExists && isCounterDateFieldExists) {
          break;
        }
      }

      const counter = await revisionsService.readByQuery({
        filter: {
          _and: [
            {
              collection: {
                _eq: "directus_flows",
              },
            },
            {
              item: {
                _eq: flowId,
              },
            },
            {
              version: {
                _null: true,
              },
            },
            {
              activity: {
                action: {
                  _eq: "run",
                },
              },
            },
          ],
        },
        fields: ["activity.*"],
        sort: ["-id"],
      });

      if (isCounterDateFieldExists && isCounterFieldExists) {
        await database("directus_flows")
          .where({ id: flowId })
          .update({
            flow_manager_last_run_at: new Date(),
            flow_manager_run_counter: counter.length + 1,
          });
      } else {
        logger.warn("Flow Manager: flow_manager_run_counter or flow_manager_last_run_at field is missing in directus_flows collection");
      }
    }
  });
});
