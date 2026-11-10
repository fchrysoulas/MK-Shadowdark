export const travelPromptTimers = new Map();
export const travelPromptChatMessagesSeen = new Set();
export const travelRollWaiters = new Set();
const travelMutations = new Map();

export function queueTravelMutation(groupUuid, operation) {
  const result = (travelMutations.get(groupUuid) ?? Promise.resolve()).then(operation);
  const tail = result.catch(() => {});
  travelMutations.set(groupUuid, tail);
  void tail.then(() => {
    if (travelMutations.get(groupUuid) === tail) travelMutations.delete(groupUuid);
  });
  return result;
}
