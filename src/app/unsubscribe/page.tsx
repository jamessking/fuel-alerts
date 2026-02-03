import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashToken } from "@/lib/tokens";

type SP = Promise<{ token?: string }>;

export default async function UnsubscribePage({ searchParams }: { searchParams: SP }) {
  const { token } = await searchParams;

  if (!token) {
    return <div style={{ padding: 24 }}>Invalid unsubscribe link.</div>;
  }

  const tokenHash = hashToken(token);

  const { data } = await supabaseAdmin
    .from("subscribers")
    .select("email")
    .eq("unsubscribe_token_hash", tokenHash)
    .maybeSingle();

  if (!data) {
    return <div style={{ padding: 24 }}>Invalid unsubscribe link.</div>;
  }

  await supabaseAdmin
    .from("subscribers")
    .update({
      status: "unsubscribed",
      unsubscribed_at: new Date().toISOString(),
      unsubscribe_token_hash: null, // single-use
    })
    .eq("unsubscribe_token_hash", tokenHash);

  return <div style={{ padding: 24 }}>✅ Unsubscribed. You won’t receive any more emails.</div>;
}
