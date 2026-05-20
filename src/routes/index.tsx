import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";

const EmotionMap = lazy(() =>
  import("@/components/EmotionMap").then((m) => ({ default: m.EmotionMap })),
);

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <main className="relative">
      <Suspense
        fallback={
          <div className="flex h-[100dvh] w-full items-center justify-center text-sm text-muted-foreground">
            Loading the world…
          </div>
        }
      >
        <EmotionMap />
      </Suspense>
      <Toaster position="top-center" theme="dark" richColors />
    </main>
  );
}
