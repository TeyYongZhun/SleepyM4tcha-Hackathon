import { createIdStore } from "./id-store";

/** Emails a person has marked resolved (the Resolve button in the summary panel). */
const store = createIdStore("wayboxai:resolved");
export const setResolved = store.set;
export const useResolvedIds = store.useIds;
