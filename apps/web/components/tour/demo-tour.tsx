"use client";
import { Button } from "@/components/ui/button";
import { Route } from "lucide-react";

export function TourLauncher() {
  return (
    <Button variant="outline" size="sm" className="hidden sm:inline-flex">
      <Route />
      Demo Tour
    </Button>
  );
}

export function TourPanel() {
  return null;
}
