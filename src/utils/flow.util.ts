import { IOperation, IPayload } from '../types';

export function transformData(list: IOperation[], flowId: string, flowTriggerId: string) {
  const result: Partial<IPayload> = {};

  function findItemById(id: string | null) {
    return list.find((item) => item.id === id);
  }

  function buildNestedObject(item?: IOperation) {
    if (!item) {
      return null;
    }

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

  return result;
}
