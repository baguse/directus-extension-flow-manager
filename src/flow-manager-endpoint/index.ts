import { defineEndpoint } from "@directus/extensions-sdk";
import axios from "axios";
import { transformData } from "../utils/flow.util";
import type { IFlow, IOperation, ISyncFlowCounter } from "../types";
import isEqual from "lodash/isEqual";
import { generateUUID } from '../utils/common.util';
import { extendedFormatDate } from '../utils/date.util';

export default defineEndpoint(
	(router, { database, services, getSchema, logger }) => {
		router.post("/flow-manager/process", async (_req, res) => {
      // @ts-expect-error this is the internal directus accountability data
      if (!_req.accountability?.admin) {
        res.status(401).send({
					error: "Unauthorized",
				});
        return;
      }
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

		router.post("/flow-manager/sync-counters", async (_req, res) => {
      const {staticToken, url, type} = _req.body as ISyncFlowCounter;
      if (type === 'local') {
        // @ts-expect-error this is the internal directus accountability data
        if (!_req.accountability?.admin) {
          res.status(401).send({
            error: "Unauthorized",
          });
          return;
        }
        try {
          const { ActivityService } = services;
          const schema = await getSchema({ database });
          const activityService = new ActivityService({
            knex: database,
            schema,
          });
          const flows = await database("directus_flows")
            .select("directus_flows.id", "flow_manager_metadata.id as metadata_id")
            .leftJoin("flow_manager_metadata", "directus_flows.flow_manager_metadata_id", "flow_manager_metadata.id");
  
          for (let i = 0; i < flows.length; i++) {
            const flow = flows[i];
            let successCounter = 0;
            let errorCounter = 0;
            let lastStepErrorMessage = "";
            let lastStepOperation = "";
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
              fields: ["id", "revisions.data", "timestamp"],
              limit: -1,
              sort: ["-id"]
            });
            const lastRunAt: string | null = activities[0]?.timestamp || null;
  
            for (let j = 0; j < activities.length; j++) {
              const activity = activities[j];
              if (activity) {
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
                    if (lastStepStatus === "reject") {
                      // A rejected step does not always carry a $last payload. When it is
                      // null, Array.isArray(null) is false, so the else branch used to read
                      // .message off null and throw inside the action handler.
                      const lastError = lastExecutionData.data?.$last;
                      // last activity because we sorted it desc(id)
                      if (j === 0) {
                        if (Array.isArray(lastError)) {
                          lastStepErrorMessage = lastError[0]?.message ?? "";
                        } else {
                          lastStepErrorMessage = lastError?.message ?? "";
                        }
                        lastStepOperation = lastStep.operation;
                      }
                    }
                  }
    
                  if (lastStepStatus === "reject") {
                    errorCounter += 1;
                  } else {
                    successCounter += 1;
                  }
                }
              }
            }
  
            const payload = {
              flow_manager_last_run_at: lastRunAt ? extendedFormatDate(lastRunAt, 'YYYY-MM-DD HH:mm:ss') : null,
              flow_manager_success_counter: successCounter,
              flow_manager_error_counter: errorCounter,
              flow_manager_run_counter: successCounter + errorCounter,
              flow_manager_last_run_message: lastStepErrorMessage,
              flow_manager_last_run_operation: lastStepOperation,
            }
            if (flow.metadata_id) {
              await database("flow_manager_metadata").update(payload).where('id', flow.metadata_id)
            } else {
              const metadataId = generateUUID()
              await database("flow_manager_metadata")
              .insert({
                id: metadataId,
                ...payload
              })
              await database("directus_flows").update({flow_manager_metadata_id: metadataId}).where('id', flow.id)
            }
          }
          res.status(200).send({
            flows,
          });
        } catch (e: any) {
          res.status(500).send({
            error: e?.response?.data || e?.message,
            status: e.status,
          });
        }
      } else if (type === 'remote' && staticToken && url) {
        try {
          const {data: {data: currentUser}} = await axios.get(`${url}/users/me?fields[]=role.policies.policy.admin_access&fields[]=policies.policy.admin_access`, {
            headers: {
              Authorization: `Bearer ${staticToken}`
            }
          });
          if (!currentUser) {
            throw new Error('User not found');
          }
          const policies = [];
          policies.push(...currentUser.policies);
          const rolePolicies = currentUser.role?.policies || [];
          policies.push(...rolePolicies)
          const isAdmin = policies.some((p) => p.policy.admin_access);
          if (!isAdmin) {
            res.status(401).send({
              error: "Unauthorized",
            });
            return;
          }

          const {data: {data: flows}} = await axios.get(`${url}/flows?fields[]=*&fields[]=flow_manager_metadata_id.*&limit=-1`, {
            headers: {
              Authorization: `Bearer ${staticToken}`
            }
          });

          for (let i = 0; i < flows.length; i++) {
            const flow = flows[i];
            let successCounter = 0;
            let errorCounter = 0;
            let lastStepErrorMessage = "";
            let lastStepOperation = "";
            const {data: {data: activities}} = await axios.get(`${url}/activity?fields[]=id&fields[]=timestamp&filter[_and][0][item][_eq]=${flow.id}&filter[_and][1][action][_eq]=run&filter[_and][2][collection][_eq]=directus_flows&limit=-1`, {
              headers: {
                Authorization: `Bearer ${staticToken}`
              }
            });
            const lastRunAt: string | null = activities[0]?.timestamp || null;

            for (let j = 0; j < activities.length; j++) {
              const activity = activities[j];
              if (activity) {
                const {data: {data: revisions}} = await axios.get(`${url}/revisions?fields[]=data&filter[activity][_eq]=${activity.id}&limit=-1&sort=-id`, {
                  headers: {
                    Authorization: `Bearer ${staticToken}`
                  }
                });
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
                    if (lastStepStatus === "reject") {
                      // A rejected step does not always carry a $last payload. When it is
                      // null, Array.isArray(null) is false, so the else branch used to read
                      // .message off null and throw inside the action handler.
                      const lastError = lastExecutionData.data?.$last;
                      // last activity because we sorted it desc(id)
                      if (j === 0 && k === 0) {
                        if (Array.isArray(lastError)) {
                          lastStepErrorMessage = lastError[0]?.message ?? "";
                        } else {
                          lastStepErrorMessage = lastError?.message ?? "";
                        }
                        lastStepOperation = lastStep.operation;
                      }
                    }
                  }
    
                  if (lastStepStatus === "reject") {
                    errorCounter += 1;
                  } else {
                    successCounter += 1;
                  }
                }
              }
            }

            const payload = {
              flow_manager_last_run_at: lastRunAt ? extendedFormatDate(lastRunAt, 'YYYY-MM-DD HH:mm:ss') : null,
              flow_manager_success_counter: successCounter,
              flow_manager_error_counter: errorCounter,
              flow_manager_run_counter: successCounter + errorCounter,
              flow_manager_last_run_message: lastStepErrorMessage,
              flow_manager_last_run_operation: lastStepOperation,
            }
            if (flow.flow_manager_metadata_id?.id) {
              await axios.patch(`${url}/items/flow_manager_metadata/${flow.flow_manager_metadata_id.id}`, payload, {
                headers: {
                  Authorization: `Bearer ${staticToken}`
                }
              });
            } else {
              const {data: createdMetadata} = await axios.post(`${url}/items/flow_manager_metadata`, payload, {
                headers: {
                  Authorization: `Bearer ${staticToken}`
                }
              });
              await axios.patch(`${url}/flows/${flow.id}`, {
                flow_manager_metadata_id: createdMetadata.id
              }, {
                headers: {
                  Authorization: `Bearer ${staticToken}`
                }
              });
            }
          }
          res.status(200).send({
            flows,
          });
        } catch (e: unknown) {
          console.dir({
            file: "index.ts",
            line: 217,
            e: e.response?.data || e.message
           }, {depth: 10});
          const error = e as { message: string }
          res.status(500).send({
            error: error.message || "Internal server error",
          });
        }
      }
		});

		router.get("/flow-manager/dashboard/:flowId", async (_req, res) => {
      // @ts-expect-error this is the internal directus accountability data
      if (!_req.accountability?.admin) {
        res.status(401).send({
					error: "Unauthorized",
				});
        return;
      }
			try {
				const page = _req.query.page
					? parseInt(String(_req.query.page), 10)
					: 1;
				const limit = _req.query.limit
					? parseInt(String(_req.query.limit), 10)
					: 10;
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
					data: unknown;
				}[] = [];
				const [flow] = (await flowsService.readByQuery({
					filter: {
						id: {
							_eq: _req.params.flowId,
						},
					},
					fields: [
						"id",
						"flow_manager_success_counter",
						"flow_manager_error_counter",
						"operations.id",
						"operations.name",
					],
				})) as unknown as {
					id: string;
					flow_manager_success_counter: number;
					flow_manager_error_counter: number;
					operations: { id: string; name: string }[];
				}[];
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

				const operationMap = flow.operations.reduce(
					(acc, operation) => {
						acc[operation.id] = operation.name;
						return acc;
					},
					{} as Record<string, string>,
				);
				for (let j = 0; j < activities.length; j++) {
					const activity = activities[j];
          if (activity) {
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
                const lastStep =
                  lastExecutionData.steps?.[lastExecutionData.steps?.length - 1];
                lastStepStatus = lastStep?.status;
                const lastData = lastExecutionData.data?.$last;
                if (lastStepStatus === "reject" && lastData != null) {
                  lastStepOperationName = lastStep?.operation
                    ? (operationMap[lastStep.operation] ?? "")
                    : "";
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

		router.post("/flow-manager/push-to-cloud", async (_req, res) => {
      // @ts-expect-error this is the internal directus accountability data
      if (!_req.accountability?.admin) {
        res.status(401).send({
					error: "Unauthorized",
				});
        return;
      }
			try {
				const { FlowsService } = services;
				const flowsService = new FlowsService({
					knex: database,
					schema: await getSchema({ database }),
				});
				const operationFields = [
					"operations.id",
					"operations.name",
					"operations.key",
					"operations.type",
					"operations.position_x",
					"operations.position_y",
					"operations.options",
					"operations.resolve",
					"operations.reject",
					"operations.flow",
				];
				const {
					config: { url, staticToken },
					flowId,
				} = _req.body;

				const [flow] = await flowsService.readByQuery({
					filter: {
						id: {
							_eq: flowId,
						},
					},
					fields: ["*", ...operationFields],
				});
        if (!flow) {
					res.status(404).send({ error: "Flow not found" });
					return;
				}

				const flowFields = [
					"name",
					"icon",
					"color",
					"description",
					"trigger",
					"operation",
					"options",
				];

				const data = transformData(
					flow.operations,
					flow.id,
					flow.operation || "",
					true,
				);

				const axiosInstance = axios.create({
					baseURL: url,
					headers: {
						"Content-Type": "application/json",
						...(staticToken ? { Authorization: `Bearer ${staticToken}` } : {}),
					},
				});
				const fields = [
					`fields[]=*`,
					...operationFields.map((f) => `fields[]=${f}`),
				];
				const {
					data: { data: flowResponse },
				} = await axiosInstance.request({
					url: `/flows?filter[id][_eq]=${flow.id}&${fields.join("&")}`,
					method: "GET",
				});

				if (!flowResponse[0]) {
					// flow is not exist
					const {
						data: { data: flowCreationResponse },
					} = await axiosInstance.request({
						url: `/flows`,
						method: "POST",
						data: {
							id: flow.id,
							name: flow.name,
							status: "inactive",
							icon: flow.icon,
							accountability: flow.accountability,
							description: flow.description,
							trigger: flow.trigger,
							options: flow.options,
							color: flow.color,
						},
					});
					await axiosInstance.request({
						url: `/flows/${flowCreationResponse.id}`,
						method: "PATCH",
						data: {
							operation: flow.operation ? data.operation : null,
							operations: {
								create: data.operations,
							},
						},
					});
				} else {
					const newFlow: Partial<IFlow> = {};
					const oldFlow: Partial<IFlow> = {};

					for (let i = 0; i < flowFields.length; i += 1) {
						const field = flowFields[i] as keyof IFlow;
						newFlow[field] = (flow as unknown as Partial<IFlow>)[field] as undefined;
						oldFlow[field] = flowResponse[0][field];
					}

					if (!isEqual(newFlow, oldFlow)) {
						await axiosInstance.request({
							url: `/flows/${flowId}`,
							method: "PATCH",
							data: newFlow,
						});

						logger.info(`[FLOW MANAGER] Flow ${flowId} Updated`);
					}

					const newOperations = flow.operations.reduce(
						(acc: Record<string, IOperation>, o: IOperation) => {
							acc[o.id] = o;
							return acc;
						},
						{},
					);
					const oldOperations = flowResponse[0].operations.reduce(
						(acc: Record<string, IOperation>, o: IOperation) => {
							acc[o.id] = o;
							return acc;
						},
						{},
					);

					const newOperationIds = Object.keys(newOperations);
					const oldOperationIds = Object.keys(oldOperations);

					const removedOperationIds = oldOperationIds.filter(
						(id) => !newOperationIds.includes(id),
					);
					const needUpdateIds: string[] = [];
					const needCreatedIds: string[] = [];

					for (let i = 0; i < newOperationIds.length; i += 1) {
						const newOperationId = String(newOperationIds[i]);
						const newOperation = newOperations[newOperationId];

						const oldOperation = oldOperations[newOperationId];

						if (!oldOperation) {
							// the operation doesn't exist
							needCreatedIds.push(newOperationId);
						} else {
							if (isEqual(newOperation, oldOperation)) {
								logger.info(
									`[FLOW MANAGER] Skipped operation ${newOperationId}. Already same!`,
								);
							} else {
								needUpdateIds.push(newOperationId);
							}
						}
					}

					for (let i = 0; i < needCreatedIds.length; i += 1) {
						const id = String(needCreatedIds[i]);
						const data = newOperations[id];
						try {
							await axiosInstance.request({
								url: `/operations`,
								method: "POST",
								data,
							});

							logger.info(`[FLOW MANAGER] Operation ${id} Created`);
						} catch (e) {
							logger.error(
								`[FLOW MANAGER] Failed to create Operation with id ${id}`,
							);
							throw e;
						}
					}

					for (let i = 0; i < needUpdateIds.length; i += 1) {
						const id = String(needUpdateIds[i]);
						const data = newOperations[id];
						try {
							await axiosInstance.request({
								url: `/operations/${id}`,
								method: "PATCH",
								data,
							});

							logger.info(`[FLOW MANAGER] Operation ${id} updated`);
						} catch (e) {
							logger.error(
								`[FLOW MANAGER] Failed to update Operation with id ${id}`,
							);
							throw e;
						}
					}

					for (let i = 0; i < removedOperationIds.length; i += 1) {
						const id = String(removedOperationIds[i]);
						try {
							await axiosInstance.request({
								url: `/operations/${id}`,
								method: "DELETE",
							});

							logger.info(`[FLOW MANAGER] Operation ${id} removed`);
						} catch (e) {
							logger.error(
								`[FLOW MANAGER] Failed to remove Operation with id ${id}`,
							);
							throw e;
						}
					}
				}
			} catch (e: any) {
				res.status(500).json({
					message: e.message,
				});
				logger.error(e.message);
				return;
			}
			res.json({
				message: "Processing the sync process",
			});
		});
	},
);
