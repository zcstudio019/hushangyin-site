"use client";
import { useEffect } from "react";
export function SiteInteractions() {
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const chip = (event.target as Element).closest<HTMLElement>(
        "[data-filter]",
      );
      if (!chip) return;
      document
        .querySelectorAll("[data-filter]")
        .forEach((el) => el.classList.toggle("active", el === chip));
      document.querySelectorAll<HTMLElement>(".detail-card").forEach((card) => {
        card.hidden =
          chip.dataset.filter !== "all" &&
          card.dataset.category !== chip.dataset.filter;
      });
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);
  return null;
}
