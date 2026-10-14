"use client";
// Console-style keyboard: arrows move the selection inside a nav group (data-nav="row" | "list" | "grid")
// and Up/Down hop between groups; Enter = (A) open; Esc/Backspace = (B) back; + or t = Demo Tour.
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTour } from "@/components/tour/demo-tour";

const ITEM = "[data-nav-item]:not([disabled]):not([aria-disabled='true'])";

function editable(el: Element | null) {
  if (!el) return false;
  const t = el as HTMLElement;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.getAttribute("role") === "slider";
}

function visible(el: HTMLElement) {
  return el.offsetParent !== null || el.getClientRects().length > 0;
}

function groups(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("[data-nav]")].filter(
    (g) => visible(g) && !g.closest("[role=dialog]") === !document.querySelector("[role=dialog]"),
  );
}

function items(group: HTMLElement) {
  return [...group.querySelectorAll<HTMLElement>(ITEM)].filter((i) => i.closest("[data-nav]") === group && visible(i));
}

function focusGroup(g: HTMLElement) {
  const list = items(g);
  const target = list.find((i) => i.getAttribute("aria-current") || i.dataset.active === "true") ?? list[0];
  target?.focus();
  target?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

export function KeyboardNav() {
  const router = useRouter();
  const path = usePathname();
  const tour = useTour();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const active = document.activeElement as HTMLElement | null;
      const typing = editable(active);
      // Inside a dialog only its own keys apply (Esc closes it); page and tour shortcuts are off.
      const dialogOpen = !!document.querySelector("[role=dialog]");
      if (dialogOpen && e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

      if (!typing && (e.key === "+" || e.key === "t")) {
        e.preventDefault();
        if (!tour.active) tour.start();
        return;
      }
      if (e.key === "Escape" || (e.key === "Backspace" && !typing)) {
        if (e.key === "Escape" && typing) {
          active?.blur();
          return;
        }
        if (path !== "/") {
          e.preventDefault();
          router.push("/");
        }
        return;
      }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) || typing) return;

      const all = groups();
      const group = active?.closest<HTMLElement>("[data-nav]");
      if (!group || !all.includes(group)) {
        if (all[0]) {
          e.preventDefault();
          focusGroup(all[0]);
        }
        return;
      }
      const kind = group.dataset.nav;
      const list = items(group);
      const i = list.indexOf(active!.closest<HTMLElement>("[data-nav-item]")!);
      const cols = kind === "grid" ? Number(getComputedStyle(group).gridTemplateColumns.split(" ").length) || 1 : 1;
      let next: HTMLElement | undefined;
      if (kind === "row" || kind === "grid") {
        if (e.key === "ArrowRight") next = list[i + 1];
        if (e.key === "ArrowLeft") next = list[i - 1];
      }
      if (kind === "list" || kind === "grid") {
        const step = kind === "grid" ? cols : 1;
        if (e.key === "ArrowDown") next = list[i + step];
        if (e.key === "ArrowUp") next = list[i - step];
      }
      if (next) {
        e.preventDefault();
        next.focus();
        next.scrollIntoView({ block: "nearest", inline: "nearest" });
        return;
      }
      // Off the edge of a group: Up/Down (and Left/Right from a list) hop to the neighbouring group.
      const gi = all.indexOf(group);
      const forward = e.key === "ArrowDown" || (kind === "list" && e.key === "ArrowRight");
      const back = e.key === "ArrowUp" || (kind === "list" && e.key === "ArrowLeft");
      const target = forward ? all[gi + 1] : back ? all[gi - 1] : undefined;
      if (target) {
        e.preventDefault();
        focusGroup(target);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, path, tour]);

  return null;
}
