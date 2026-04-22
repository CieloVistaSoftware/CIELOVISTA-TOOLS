"use strict";

async function main() {
  const apiKey = process.env.CLAUDE;

  if (!apiKey) {
    console.log("FAIL CLAUDE environment variable is not set");
    process.exitCode = 1;
    return;
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 10,
        messages: [{ role: "user", content: "hi" }]
      })
    });

    const data = await response.json().catch(() => ({}));

    if (data.type === "message") {
      console.log("KEY OK");
      return;
    }

    console.log(data.error?.message || JSON.stringify(data));
    process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log("FAIL", message);
    process.exitCode = 1;
  }
}

void main();
