export async function sendWhatsAppMessage(
  to: string,
  text: string
): Promise<void> {
  const res = await fetch("https://api.ycloud.com/v2/whatsapp/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": process.env.YCLOUD_API_KEY!,
    },
    body: JSON.stringify({
      from: process.env.YCLOUD_PHONE_NUMBER_ID,
      to,
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`YCloud API error ${res.status}: ${err}`);
  }
}
