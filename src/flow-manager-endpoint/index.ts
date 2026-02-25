import { defineEndpoint } from "@directus/extensions-sdk";
import axios from "axios";
import { transformData } from "../utils/flow.util";
import type { IFlow, IOperation } from "../types";
import isEqual from "lodash/isEqual";

export default defineEndpoint(
	(router, { database, services, getSchema, logger }) => {
		router.post("/flow-manager/process", async (_req, res) => {
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
								const lastStep =
									lastExecutionData.steps?.[
										lastExecutionData.steps?.length - 1
									];
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

		router.get(
			"/flow-manager/dashboard/:flowId",
			async (_req, res) => {
				try {
					const page = _req.query.page ? parseInt(String(_req.query.page), 10) : 1;
					const limit = _req.query.limit ? parseInt(String(_req.query.limit), 10) : 10;
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
					})) as {
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
									lastExecutionData.steps?.[
										lastExecutionData.steps?.length - 1
									];
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
			},
		);

		router.post("/flow-manager/push-to-cloud", async (_req, res) => {
			try {
				const { FlowsService } = services;
				const flowsService = new FlowsService({
					knex: database,
					schema: await getSchema({ database }),
				});
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
					fields: ["*", "operations.*"],
				});

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
					flow.operation,
					true,
				);

				const axiosInstance = axios.create({
					baseURL: url,
					headers: {
						"Content-Type": "application/json",
						...(staticToken ? { Authorization: `Bearer ${staticToken}` } : {}),
					},
				});
				const {
					data: { data: flowResponse },
				} = await axiosInstance.request({
					url: `/flows?filter[id][_eq]=${flow.id}&fields[]=*&fields[]=operations.*`,
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
						newFlow[field] = flow[field];
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
						await axiosInstance.request({
							url: `/operations`,
							method: "POST",
							data,
						});

						logger.info(`[FLOW MANAGER] Operation ${id} Created`);
					}

					for (let i = 0; i < needUpdateIds.length; i += 1) {
						const id = String(needUpdateIds[i]);
						const data = newOperations[id];
						await axiosInstance.request({
							url: `/operations/${id}`,
							method: "PATCH",
							data,
						});

						logger.info(`[FLOW MANAGER] Operation ${id} updated`);
					}

					for (let i = 0; i < removedOperationIds.length; i += 1) {
						const id = String(removedOperationIds[i]);
						await axiosInstance.request({
							url: `/operations/${id}`,
							method: "DELETE",
						});

						logger.info(`[FLOW MANAGER] Operation ${id} removed`);
					}
				}
			} catch {
				//
			}
			res.json({});
		});
	},
);
