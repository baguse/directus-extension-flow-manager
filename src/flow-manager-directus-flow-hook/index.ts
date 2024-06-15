import { defineHook } from "@directus/extensions-sdk";

export default defineHook(({ action }, { services }) => {
  action("activity.create", async (data: any, { database, schema }) => {
    const {
      payload: { action, item: flowId },
    } = data;
    const { RevisionsService } = services;
    if (action === "run") {
      const revisionsService = new RevisionsService({
        knex: database,
        schema,
      });

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

      await database("directus_flows").where({ id: flowId }).update({
        flow_manager_last_run_at: new Date(),
        flow_manager_run_counter: counter.length + 1,
      });
    }
  });
});
