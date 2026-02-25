import { IOperation, IPayload } from "../types";

function getChildKeys(item: IPayload) {
  const childKeys: string[] = [];

  if (item.resolve?.key) {
    childKeys.push(item.resolve.key);
  }

  if (item.reject?.key) {
    childKeys.push(item.reject.key);
  }

  if (item.resolve?.resolve?.key) {
    childKeys.push(...getChildKeys(item.resolve));
  }

  if (item.reject?.reject?.key) {
    childKeys.push(...getChildKeys(item.reject));
  }

  return childKeys;
}

export function transformData(list: IOperation[], flowId: string, flowTriggerId: string, isPreserveId = false) {
  const result: Partial<IPayload> = {};

  function findItemById(id: string | null) {
    return list.find((item) => item.id === id);
  }

  const unconnectedItems: IOperation[] = [];
  const connectedItemIds: string[] = [];

  function buildNestedObject(item?: IOperation) {
    if (!item) {
      return null;
    }

    connectedItemIds.push(item.id);

    const nestedObject: IPayload = {
      name: item.name,
      position_x: item.position_x,
      position_y: item.position_y,
      key: item.key,
      type: item.type,
      options: item.options,
      flow: flowId,
      resolve: buildNestedObject(findItemById(item.resolve)),
      reject: buildNestedObject(findItemById(item.reject)),
    };
    if (isPreserveId) {
      nestedObject.id = item.id;
    }

    return nestedObject;
  }

  const firstItem = findItemById(flowTriggerId);
  result.name = firstItem?.name;
  result.position_x = firstItem?.position_x;
  result.position_y = firstItem?.position_y;
  result.key = firstItem?.key;
  result.type = firstItem?.type;
  result.options = firstItem?.options;
  result.flow = flowId;
  result.resolve = buildNestedObject(findItemById(firstItem?.resolve || null));
  result.reject = buildNestedObject(findItemById(firstItem?.reject || null));
  if (isPreserveId) {
    result.id = flowTriggerId;
  }

  function buildUnconnectedOperation(items: IOperation[], flowId: string) {
    const processedItemIds: string[] = [];
    const result: IPayload[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i] as IOperation;
      if (!processedItemIds.includes(item.id) && item.id !== flowTriggerId) {
        const nestedObject: IPayload = {
          name: item.name,
          position_x: item.position_x,
          position_y: item.position_y,
          key: item.key,
          type: item.type,
          options: item.options,
          flow: flowId,
          resolve: buildNestedObject(findItemById(item.resolve)),
          reject: buildNestedObject(findItemById(item.reject)),
        };

        result.push(nestedObject);
      }
    }

    return result;
  }

  for (let i = 0; i < list.length; i++) {
    if (!connectedItemIds.includes(list[i]?.id || "")) {
      if (list[i]) {
        unconnectedItems.push(list[i] as IOperation);
      }
    }
  }

  const unconnectedOperations = buildUnconnectedOperation(unconnectedItems, flowId);

  const childKeys = Array.from(new Set(unconnectedOperations.map((item) => getChildKeys(item)).flat()));

  const operations = unconnectedOperations.filter((item) => !childKeys.includes(item.key));

  return {
    operation: result,
    operations,
  };
}
