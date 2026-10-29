export async function trainingDependencies(token: string) {
  const [{ supabaseAdmin }, { getRequestIP, getRequestHeader }, { emotionRateLimitSubject }] =
    await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@tanstack/react-start/server"),
      import("./emotion-rate-limit.server"),
    ]);
  const hash = async (value: string) =>
    Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
  const ownerHash = await hash("training-owner:" + token);
  const subjectHash = await hash(
    "training-ip:" +
      (await emotionRateLimitSubject(
        getRequestIP(),
        getRequestHeader("cf-connecting-ip"),
        process.env.EMOTION_TRUST_CLOUDFLARE_IP === "true",
      )),
  );
  return { client: supabaseAdmin, ownerHash, subjectHash };
}
