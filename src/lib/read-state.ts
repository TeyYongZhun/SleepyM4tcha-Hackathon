import { createIdStore } from "./id-store";

/**
 * Emails that have been opened. Gmail also learns this (the UNREAD label is
 * cleared server-side), but the demo and backend inboxes have nowhere to store
 * it, and their "unread" comes back from the source unchanged on every load --
 * so this is what makes the dot stay gone.
 */
const store = createIdStore("wayboxai:read");
export const setRead = store.set;
export const useReadIds = store.useIds;
