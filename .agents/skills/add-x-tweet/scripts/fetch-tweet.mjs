#!/usr/bin/env node
/**
 * Fetch X tweet metadata for homepage testimonials.
 * Usage: node fetch-tweet.mjs "https://x.com/user/status/123"
 */

const urls = process.argv.slice(2);

if (urls.length === 0) {
  console.error("Usage: node fetch-tweet.mjs <tweet-url> [tweet-url...]");
  process.exit(1);
}

function parseTweetUrl(url) {
  const match = url.match(/(?:x|twitter)\.com\/([^/]+)\/status\/(\d+)/i);
  if (!match) {
    throw new Error(`Invalid tweet URL: ${url}`);
  }
  return { screenName: match[1], statusId: match[2] };
}

function stripReplyPrefix(text) {
  return text.replace(/^@uixmat\s*/i, "").trim();
}

function upgradeAvatar(url) {
  return url.replace(/_200x200\.(jpg|png|webp)$/i, "_400x400.$1");
}

async function fetchTweet(url) {
  const { screenName, statusId } = parseTweetUrl(url);
  const apiUrl = `https://api.fxtwitter.com/${screenName}/status/${statusId}`;
  const res = await fetch(apiUrl, {
    headers: { "User-Agent": "bklit-ui-add-x-tweet/1.0" },
  });

  if (!res.ok) {
    throw new Error(`FxTwitter ${res.status} for ${url}`);
  }

  const data = await res.json();
  const tweet = data.tweet ?? data;
  const author = tweet.author ?? {};

  const canonicalUrl = `https://x.com/${screenName}/status/${statusId}`;

  const verified = author.verification?.verified === true;

  return {
    author: {
      avatar: upgradeAvatar(author.avatar_url ?? author.avatar ?? ""),
      handle: `@${author.screen_name ?? screenName}`,
      name: author.name ?? screenName,
      verified,
    },
    content: stripReplyPrefix(tweet.text ?? ""),
    id: statusId,
    url: canonicalUrl,
  };
}

for (const url of urls) {
  try {
    const entry = await fetchTweet(url);
    console.log(JSON.stringify(entry, null, 2));
  } catch (error) {
    console.error(`Failed: ${url}`);
    console.error(error.message);
    process.exitCode = 1;
  }
}
