import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { parseSharedFeeling, parseShareLanguage, type FeelingSearch } from "@/lib/feeling-share";

const EmotionMap = lazy(() =>
  import("@/components/EmotionMap").then((m) => ({ default: m.EmotionMap })),
);

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): FeelingSearch => ({
    feeling: parseSharedFeeling(search.feeling),
    lang: parseShareLanguage(search.lang),
  }),
  component: Index,
});

function Index() {
  const search = Route.useSearch();
  return (
    <main className="relative">
      <Suspense
        fallback={
          <div className="flex h-[100dvh] w-full items-center justify-center text-sm text-muted-foreground">
            Loading the world…
          </div>
        }
      >
        <EmotionMap invitationEmotion={search.feeling} invitationLanguage={search.lang} />
      </Suspense>
      <Toaster position="top-center" theme="dark" richColors />
    </main>
  );
}
