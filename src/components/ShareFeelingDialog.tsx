import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { EMOTIONS_BY_KEY, type EmotionKey } from "@/lib/emotions";
import { useI18n } from "@/lib/i18n";
import {
  createFeelingLink,
  PUBLIC_SITE_URL,
  reportFeelingShare,
  shareFeeling,
} from "@/lib/feeling-share";
import { createFeelingArtwork, SHARE_COLORS } from "@/lib/feeling-artwork";

export function ShareFeelingDialog({
  emotion,
  onClose,
}: {
  emotion: EmotionKey;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const [image, setImage] = useState<Blob | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loggedEmotionRef = useRef<EmotionKey | null>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const meta = EMOTIONS_BY_KEY[emotion];
  const color = SHARE_COLORS[emotion];
  const url = createFeelingLink(PUBLIC_SITE_URL, emotion, lang);
  const statement = t(`share.statement.${emotion}`);
  const prompt = t("share.prompt");

  useEffect(() => {
    if (loggedEmotionRef.current !== emotion) {
      loggedEmotionRef.current = emotion;
      reportFeelingShare("card_opened", emotion);
    }
  }, [emotion]);
  useEffect(() => {
    let cancelled = false;
    setImage(null);
    setImageFailed(false);
    createFeelingArtwork({
      emoji: meta.emoji,
      statement,
      prompt,
      hostname: new URL(PUBLIC_SITE_URL).hostname,
      color,
    })
      .then((blob) => {
        if (!cancelled) setImage(blob);
      })
      .catch(() => {
        if (!cancelled) setImageFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [meta.emoji, statement, prompt, color]);

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setNotice("share.copied");
      reportFeelingShare("link_copied", emotion);
    } catch {
      linkRef.current?.focus();
      linkRef.current?.select();
      setNotice("share.copy.manual");
    }
  };
  const share = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const outcome = await shareFeeling(
        navigator,
        {
          title: "Feel the World",
          text: `${statement}\n${prompt}`,
          url,
        },
        image ? new File([image], `feel-${emotion}.png`, { type: "image/png" }) : undefined,
      );
      if (outcome === "shared") {
        reportFeelingShare("native_completed", emotion);
        setNotice("share.done");
      } else if (outcome === "unavailable") await copy();
    } finally {
      setBusy(false);
    }
  };
  const download = () => {
    if (!image) return;
    const objectUrl = URL.createObjectURL(image);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `feel-${emotion}.png`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    reportFeelingShare("image_downloaded", emotion);
  };
  const button =
    "rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-accent disabled:opacity-50";
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[2000] bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[2001] grid max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-3xl border border-border bg-background p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-xl font-semibold">{t("share.title")}</Dialog.Title>
            <Dialog.Close className={button} aria-label={t("share.close")}>
              ×
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-sm text-muted-foreground">
            {t("share.description")}
          </Dialog.Description>
          <div
            className="rounded-2xl border p-6 text-center"
            style={{
              borderColor: color + "66",
              background: `radial-gradient(ellipse at top, ${color}33, #080d19 85%)`,
            }}
          >
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-300">Feel the World</p>
            <span className="my-4 block text-6xl" aria-hidden="true">
              {meta.emoji}
            </span>
            <p className="text-xl font-semibold text-white">{statement}</p>
            <p className="mt-3 text-sm text-slate-300">{prompt}</p>
          </div>
          <p className="text-xs text-muted-foreground">{t("share.privacy")}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void share()}
              className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {t("share.action")}
            </button>
            <button type="button" onClick={() => void copy()} className={button}>
              {t("share.copy")}
            </button>
            <button type="button" disabled={!image} onClick={download} className={button}>
              {t("share.download")}
            </button>
          </div>
          <label className="grid gap-1 text-xs text-muted-foreground">
            {t("share.link")}
            <input
              ref={linkRef}
              readOnly
              value={url}
              onFocus={(event) => event.target.select()}
              className="w-full rounded-lg border border-border bg-surface p-2 text-xs text-foreground"
            />
          </label>
          <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {notice ? t(notice) : imageFailed ? t("share.image.error") : null}
          </div>
          <Dialog.Close className={button}>{t("share.back")}</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
