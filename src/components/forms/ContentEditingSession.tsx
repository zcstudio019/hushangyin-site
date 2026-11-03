"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
type Session = {
  revision: number;
  dirty: boolean;
  busy: boolean;
  markDirty(): void;
  begin(kind: "save" | "workflow"): boolean;
  finish(): void;
  saved(revision: number): void;
};
const Context = createContext<Session | null>(null);
export const useContentEditingSession = () => useContext(Context);
export function ContentEditingSession({
  revision,
  children,
}: {
  revision: number;
  children: React.ReactNode;
}) {
  const [current, setCurrent] = useState(revision),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false);
  const guard = useRef({ busy: false, dirty: false });
  useEffect(() => {
    if (!guard.current.dirty && !guard.current.busy) setCurrent(revision);
  }, [revision]);
  return (
    <Context.Provider
      value={{
        revision: current,
        dirty,
        busy,
        markDirty() {
          guard.current.dirty = true;
          setDirty(true);
        },
        begin(kind) {
          if (
            guard.current.busy ||
            (kind === "workflow" && guard.current.dirty)
          )
            return false;
          guard.current.busy = true;
          setBusy(true);
          return true;
        },
        finish() {
          guard.current.busy = false;
          setBusy(false);
        },
        saved(value) {
          setCurrent(value);
          guard.current.dirty = false;
          setDirty(false);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
