import { createFileRoute } from "@tanstack/react-router";

import { DocPage, DocSection } from "#/components/doc-page.tsx";

export const Route = createFileRoute("/security")({ component: SecurityPage });

function SecurityPage() {
  return (
    <DocPage
      title="Security is not a mode."
      lead="Phemera encrypts every message and file in the browser before upload. The server stores ciphertext."
    >
      <DocSection title="Your files are end-to-end encrypted.">
        <p>
          Messages and files up to 100 MiB use AES-256-GCM. Larger files use
          libsodium secretstream (XChaCha20-Poly1305). Encryption is always on.
          A password is not a second lock on a message or file.
        </p>
        <p>
          Encryption adds no separate file-size cap. Large files still use
          Cloudflare R2 multipart uploads, signed URLs, and object lifecycle.
          The ciphertext must fit the existing storage limits.
        </p>
      </DocSection>
      <DocSection title="Keys stay off the server.">
        <p>
          Public drop links have the form{" "}
          <code className="break-all">{"{origin}/s/{code}#{key}"}</code>. The
          part after # stays in your browser; it is not sent to the server. For
          nearby sharing, the key is wrapped to the recipient device’s P-256
          public key. We cannot decrypt your messages or files.
        </p>
        <p>
          URL shortener destinations remain visible to the server so it can
          redirect visitors. A short link can require a password first. The
          server stores a verifier, not the password, and does not reveal the
          destination until the password is correct.
        </p>
      </DocSection>
      <DocSection title="No ads. No trackers.">
        <p>The app does not load ad or analytics scripts.</p>
      </DocSection>
      <DocSection title="TLS.">
        <p>
          Your browser connects to the API over TLS in production. Object
          storage sees only ciphertext for new message and file transfers.
        </p>
      </DocSection>
      <DocSection title="What we can still see.">
        <p>
          Sizes, kinds, device ids, timestamps, expiration, and the public
          algorithm profile (kdf/cipher). Not plaintext, and not the fragment
          key. A short-link password is checked by the server and is not stored.
        </p>
      </DocSection>
      <DocSection title="Limits.">
        <p>
          Anyone with a full link, including the part after #, can decrypt a
          message or file. Share that link only with the recipient. Older items
          may still ask for a password that was set before this change.
        </p>
        <p>
          A compromised browser, extension, or this site’s JavaScript can read
          your keys. Expiration does not revoke copies already saved.
        </p>
      </DocSection>
    </DocPage>
  );
}
