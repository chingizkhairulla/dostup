import { createContext, useContext, useEffect, useState } from "react";

export const ConversationVisibility = createContext(true);

export function useConversationVisible() {
  const paneVisible = useContext(ConversationVisibility);
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === "visible");
  useEffect(() => {
    const change = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  return paneVisible && pageVisible;
}
