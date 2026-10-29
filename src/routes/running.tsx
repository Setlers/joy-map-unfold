import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
const RunningMap = lazy(() =>
  import("@/components/RunningMap").then((module) => ({ default: module.RunningMap })),
);
export const Route = createFileRoute("/running")({
  head: () => ({
    meta: [
      { title: "Netrénuješ sám · Feel the World" },
      {
        name: "description",
        content: "A shared map of runners training right now. You're not training alone.",
      },
    ],
  }),
  component: () => (
    <main>
      <Suspense fallback={<div className="flex h-dvh items-center justify-center">🏃</div>}>
        <RunningMap />
      </Suspense>
      <Toaster position="top-center" theme="dark" richColors />
    </main>
  ),
});
