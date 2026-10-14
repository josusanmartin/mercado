"use client";
// Two themes only: basic white and basic black. Stored per browser; applied before paint by ThemeScript.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";
const KEY = "mercado.theme";
const Ctx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => {} });

export function ThemeScript() {
  const js = `try{if(localStorage.getItem("${KEY}")==="dark")document.documentElement.classList.add("dark")}catch(e){}`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      try {
        localStorage.setItem(KEY, next);
      } catch {}
      return next;
    });
  }, []);
  return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
