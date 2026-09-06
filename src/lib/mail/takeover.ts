import "server-only";
import { Resend } from "resend";

export interface TakeoverNotice {
  to: string;
  domain: string;
  tookOverAt: Date;
  claimUrl: string;
}

const STAMP = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "UTC",
});

let client: Resend | null = null;

/** Null when unconfigured, which makes the whole feature opt-in locally. */
function resend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  client ??= new Resend(key);
  return client;
}

function body(notice: TakeoverNotice) {
  const when = `${STAMP.format(notice.tookOverAt)} UTC`;
  const lines = [
    `Another account proved control of ${notice.domain} on ${when}.`,
    "If you sold or handed off the domain, there is nothing to do.",
    "If not, you can take it back the same way: open the domain, generate a new code, publish it, and verify. Check with your team, or whoever manages this domain, on who should hold the claim first — anyone with DNS access can move it back the other way.",
    notice.claimUrl,
    "We never share who claimed a domain.",
  ];
  return {
    text: lines.join("\n\n"),
    html: lines
      .map((line) =>
        line === notice.claimUrl
          ? `<p><a href="${line}">Open the domain</a></p>`
          : `<p>${line}</p>`,
      )
      .join(""),
  };
}

/**
 * One notice to the displaced holder. It names the domain and the time and
 * nothing else: the new holder's identity never appears, in either direction.
 * Returns false when Resend is unconfigured, so the caller can tell a skipped
 * notice from a sent one.
 */
export async function sendTakeoverNotice(
  notice: TakeoverNotice,
): Promise<boolean> {
  const mailer = resend();
  const from = process.env.RESEND_FROM;

  if (!mailer || !from) {
    console.info(
      "[takeover-notice] RESEND_API_KEY or RESEND_FROM is unset; sending nothing.",
    );
    return false;
  }

  // Caught here so a bare domain reads as the configuration mistake it is,
  // rather than as an opaque rejection from the API.
  if (!from.includes("@")) {
    throw new Error(
      `RESEND_FROM must be an email address, not "${from}". Try notices@${from}.`,
    );
  }

  // The SDK reports failures in the payload rather than throwing.
  const { error } = await mailer.emails.send({
    from,
    to: notice.to,
    subject: `Your domain ${notice.domain} was claimed by another account`,
    ...body(notice),
  });
  if (error) throw new Error(`${error.name}: ${error.message}`);
  return true;
}
