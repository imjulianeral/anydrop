import { createFileRoute } from "@tanstack/react-router";

import { DocPage, DocSection } from "#/components/doc-page.tsx";

export const Route = createFileRoute("/about")({ component: AboutPage });

function AboutPage() {
  return (
    <DocPage
      title="Sharing, with privacy built in."
      lead="Send a message or a file to a nearby device, or create a link for someone farther away."
    >
      <DocSection title="Why end-to-end encryption">
        <p>
          A lock helps only if you know who holds the key. With service-held
          encryption keys, the service can unlock stored files. AnyShare
          encrypts on your device and gives the key to the recipient. Our server
          stores the encrypted content.
        </p>
      </DocSection>
      <DocSection title="A better default">
        <p>
          Encryption is on for every message and file you send. There is no
          encryption toggle and no extra password. Use nearby devices or share
          links without an account email. A shortened URL can require a password
          before it opens.
        </p>
      </DocSection>
      <DocSection title="Speed">
        <p>
          Share a link once your drop is created. Recipients download files
          after the upload finishes. Large files use Cloudflare R2 multipart
          uploads and signed GET and PUT URLs.
        </p>
      </DocSection>
      <DocSection title="Comparison">
        <p>
          Standard WeTransfer and Dropbox sharing does not use end-to-end
          encryption by default and asks senders for an identity. Dropbox offers
          end-to-end encryption for selected folders on eligible team plans.
          AnyShare encrypts every message and file by default, needs no account
          email, and shows no ads.
        </p>
        <p className="text-sm">
          See{" "}
          <a
            className="underline"
            href="https://help.dropbox.com/security/encrypted-team-folders"
          >
            Dropbox’s encryption options
          </a>{" "}
          and{" "}
          <a
            className="underline"
            href="https://help.wetransfer.com/hc/en-us/articles/204909429-How-safe-is-WeTransfer"
          >
            WeTransfer’s security information
          </a>
          .
        </p>
      </DocSection>
    </DocPage>
  );
}
