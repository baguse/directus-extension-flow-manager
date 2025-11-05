import { defineHook } from "@directus/extensions-sdk";

async function setupDirectusFlowsFields(fieldsService: any) {
  const fields = await fieldsService.readAll("directus_flows");

  let isCounterFieldExists = false;
  let isCounterDateFieldExists = false;
  let isLastExecutionMessageFieldExists = false;
  let isLastExecutionOperationFieldExists = false;

  const fieldPayloads = [];

  for (const field of fields) {
    if (field.field === "flow_manager_run_counter") {
      isCounterFieldExists = true;
    }

    if (field.field === "flow_manager_last_run_at") {
      isCounterDateFieldExists = true;
    }

    if (field.field === "flow_manager_last_run_message") {
      isLastExecutionMessageFieldExists = true;
    }

    if (field.field === "flow_manager_last_run_operation") {
      isLastExecutionOperationFieldExists = true;
    }

    if (isCounterFieldExists && isCounterDateFieldExists && isLastExecutionMessageFieldExists && isLastExecutionOperationFieldExists) {
      break;
    }
  }

  if (!isCounterFieldExists) {
    fieldPayloads.push({
      field: "flow_manager_run_counter",
      type: "integer",
      schema: { default_value: "0" },
      meta: { interface: "input", special: null, hidden: true },
      collection: "directus_flows",
    });
  }

  if (!isCounterDateFieldExists) {
    fieldPayloads.push({
      field: "flow_manager_last_run_at",
      type: "dateTime",
      schema: { default_value: null },
      meta: { interface: "input-datetime", special: null, hidden: true },
      collection: "directus_flows",
    });
  }

  if (!isLastExecutionMessageFieldExists) {
    fieldPayloads.push({
      field: "flow_manager_last_run_message",
      type: "string",
      schema: { default_value: "" },
      meta: { interface: "input", special: null, hidden: true },
      collection: "directus_flows",
    });
  }

  if (!isLastExecutionOperationFieldExists) {
    fieldPayloads.push({
      field: "flow_manager_last_run_operation",
      type: "string",
      schema: { default_value: "" },
      meta: { interface: "input", special: null, hidden: true },
      collection: "directus_flows",
    });
  }

  for (let i = 0; i < fieldPayloads.length; i += 1) {
    const payload = fieldPayloads[i];
    await fieldsService.createField(payload?.collection, payload);
  }
}

export default defineHook(({ action }, { services }) => {
  action("revisions.create", async (data: any, { database, schema }) => {
    const { RevisionsService, FieldsService, ActivityService } = services;
    const activityService = new ActivityService({
      knex: database,
      schema,
    });
    const [activity] = await activityService.readByQuery({
      filter: {
        _and: [
          {
            id: {
              _eq: data.payload.activity,
            },
          },
        ],
      },
    });
    if (activity?.action === "run") {
      const revisionsService = new RevisionsService({
        knex: database,
        schema,
      });

      const fieldsService = new FieldsService({
        knex: database,
        schema,
      });

      await setupDirectusFlowsFields(fieldsService);

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
                _eq: data.payload.item,
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
        fields: ["activity.revisions.data"],
        sort: ["-id"],
      });

      let lastExecutionData = data.payload.data;
      if (typeof lastExecutionData === "string") {
        try {
          lastExecutionData = JSON.parse(lastExecutionData);
        } catch {}
      }

      let lastStepErrorMessage = "";
      let lastStepOperation = "";
      if (lastExecutionData) {
        const lastStep = lastExecutionData.steps?.[lastExecutionData.steps?.length - 1];
        const lastStepStatus = lastStep?.status;
        if (lastStepStatus === "reject") {  
          if (Array.isArray(lastExecutionData.data.$last)) {
            lastStepErrorMessage = lastExecutionData.data.$last[0].message;
          } else {
            lastStepErrorMessage = lastExecutionData.data.$last.message;
          }
          lastStepOperation = lastStep.operation;
        }
      }

      await database("directus_flows")
        .where({ id: data.payload.item })
        .update({
          flow_manager_last_run_at: new Date(),
          flow_manager_run_counter: counter.length,
          flow_manager_last_run_message: lastStepErrorMessage,
          flow_manager_last_run_operation: lastStepOperation,
        });
    }
  });
});
