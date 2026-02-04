import { defineEndpoint } from "@directus/extensions-sdk";
import axios from "axios";

export default defineEndpoint((router, { database, services, getSchema }) => {
  router.post("/flow-manager/process", async (_req: any, res: any) => {
    const { url, staticToken, method, payload } = _req.body;

    try {
      const { data } = await axios.request({
        url,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(staticToken ? { Authorization: `Bearer ${staticToken}` } : {}),
        },
        data: payload,
      });

      res.send(data);
    } catch (e: any) {
      res.status(500).send({
        error: e?.response?.data,
        status: e.status,
      });
    }
  });

  router.post("/flow-manager/sync-counters", async (_req: any, res: any) => {
    try {
      const { ActivityService } = services;
      const schema = await getSchema({ database });
      const activityService = new ActivityService({
        knex: database,
        schema,
      });
      const flows = await database("directus_flows").select("*");

      for (let i = 0; i < flows.length; i++) {
        const flow = flows[i];
        let successCounter = 0;
        let errorCounter = 0;
        const activities = await activityService.readByQuery({
          filter: {
            _and: [
              {
                item: {
                  _eq: flow.id,
                },
              },
              {
                action: {
                  _eq: "run",
                },
              },
              {
                collection: {
                  _eq: "directus_flows",
                },
              },
            ],
          },
          fields: ["id", "revisions.data"],
          limit: -1,
        });

        for (let j = 0; j < activities.length; j++) {
          const activity = activities[j];
          const revisions = activity.revisions;
          for (let k = 0; k < revisions.length; k++) {
            const revision = revisions[k];

            let lastExecutionData = revision.data;
            if (typeof lastExecutionData === "string") {
              try {
                lastExecutionData = JSON.parse(lastExecutionData);
              } catch {}
            }

            let lastStepStatus = "";
            if (lastExecutionData) {
              const lastStep = lastExecutionData.steps?.[lastExecutionData.steps?.length - 1];
              lastStepStatus = lastStep?.status;
            }

            if (lastStepStatus === "reject") {
              errorCounter += 1;
            } else {
              successCounter += 1;
            }
          }
        }

        await database("directus_flows").where({ id: flow.id }).update({
          flow_manager_success_counter: successCounter,
          flow_manager_error_counter: errorCounter,
        });
      }
      res.status(200).send({
        flows,
      });
    } catch (e: any) {
      res.status(500).send({
        error: e?.response?.data,
        status: e.status,
      });
    }
  });

  router.get("/flow-manager/dashboard/:flowId", async (_req: any, res: any) => {
    try {
      const page = _req.query.page ? parseInt(_req.query.page) : 1;
      const limit = _req.query.limit ? parseInt(_req.query.limit) : 10;
      const { ActivityService, FlowsService } = services;
      const schema = await getSchema({ database });
      const flowsService = new FlowsService({
        knex: database,
        schema,
      });
      const activityService = new ActivityService({
        knex: database,
        schema,
      });
      const activityHistories: {
        id: number;
        type: "success" | "error";
        date: Date;
        operation: string;
        message: string;
        data: any;
      }[] = [];
      const [flow] = (await flowsService.readByQuery({
        filter: {
          id: {
            _eq: _req.params.flowId,
          },
        },
        fields: ["id", "flow_manager_success_counter", "flow_manager_error_counter", "operations.id", "operations.name"],
      })) as { id: string; flow_manager_success_counter: number; flow_manager_error_counter: number; operations: { id: string; name: string }[] }[];
      if (!flow) {
        res.status(404).send({ error: "Flow not found" });
        return;
      }
      const activities = await activityService.readByQuery({
        filter: {
          _and: [
            {
              item: {
                _eq: flow.id,
              },
            },
            {
              action: {
                _eq: "run",
              },
            },
            {
              collection: {
                _eq: "directus_flows",
              },
            },
          ],
        },
        fields: ["id", "timestamp", "revisions.data"],
        sort: ["-timestamp"],
        limit,
        page,
      });

      const operationMap = flow.operations.reduce((acc, operation) => {
        acc[operation.id] = operation.name;
        return acc;
      }, {} as Record<string, string>);
      for (let j = 0; j < activities.length; j++) {
        const activity = activities[j];
        const revisions = activity.revisions;
        for (let k = 0; k < revisions.length; k++) {
          const revision = revisions[k];

          let lastExecutionData = revision.data;
          if (typeof lastExecutionData === "string") {
            try {
              lastExecutionData = JSON.parse(lastExecutionData);
            } catch {}
          }

          let lastStepStatus = "";
          let lastStepErrorMessage = "";
          let lastStepOperationName = "";

          if (lastExecutionData) {
            const lastStep = lastExecutionData.steps?.[lastExecutionData.steps?.length - 1];
            lastStepStatus = lastStep?.status;
            const lastData = lastExecutionData.data?.$last;
            if (lastStepStatus === "reject" && lastData != null) {
              lastStepOperationName = lastStep?.operation ? (operationMap[lastStep.operation] ?? "") : "";
              lastStepErrorMessage = Array.isArray(lastData)
                ? (lastData[0]?.message ?? "")
                : (lastData?.message ?? "");
            }
          }

          if (lastStepStatus === "reject") {
            activityHistories.push({
              id: activity.id,
              type: "error",
              date: new Date(activity.timestamp),
              operation: lastStepOperationName,
              message: lastStepErrorMessage,
              data: lastExecutionData,
            });
          } else {
            activityHistories.push({
              id: activity.id,
              type: "success",
              date: new Date(activity.timestamp),
              operation: lastStepOperationName,
              message: lastStepErrorMessage,
              data: lastExecutionData,
            });
          }
        }
      }
      res.status(200).send({
        successCount: flow.flow_manager_success_counter,
        errorCount: flow.flow_manager_error_counter,
        activityHistories,
      });
    } catch (e: any) {
      res.status(500).send({
        error: e?.response?.data,
        status: e.status,
      });
    }
  });
});
