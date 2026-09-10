import { createHash } from "node:crypto";

import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

const TRANSFER_OBJECT_TTL_SECONDS = 8 * 24 * 60 * 60;

export const Files = Cloudflare.R2.Bucket("Files", {
  cors: [
    {
      allowedHeaders: ["content-type"],
      allowedMethods: ["GET", "HEAD", "PUT"],
      allowedOrigins: ["*"],
      exposeHeaders: ["etag"],
      maxAgeSeconds: 3600,
    },
  ],
  lifecycleRules: [
    {
      abortMultipartUploadsTransition: {
        condition: { maxAge: 24 * 60 * 60, type: "Age" },
      },
      deleteObjectsTransition: {
        condition: { maxAge: TRANSFER_OBJECT_TTL_SECONDS, type: "Age" },
      },
      id: "expire-transfers",
      prefix: "transfers/",
    },
  ],
}).pipe(Alchemy.remote());

export const FilesS3 = Effect.gen(function* () {
  const files = yield* Files;
  const token = yield* Cloudflare.ApiToken.AccountApiToken("FilesS3Token", {
    accountId: files.accountId,
    policies: [
      {
        effect: "allow",
        permissionGroups: ["Workers R2 Storage Bucket Item Write"],
        resources: Output.all(
          files.accountId,
          files.jurisdiction,
          files.bucketName
        ).pipe(
          Output.map(([accountId, jurisdiction, bucketName]) => ({
            [`com.cloudflare.edge.r2.bucket.${accountId}_${jurisdiction}_${bucketName}`]:
              "*",
          }))
        ),
      },
    ],
  });

  return {
    bucket: files.bucketName,
    credentials: {
      accessKeyId: token.tokenId,
      secretAccessKey: token.value.pipe(
        Output.map((value) =>
          Redacted.make(
            createHash("sha256").update(Redacted.value(value)).digest("hex")
          )
        )
      ),
    },
    endpoint: Output.interpolate`https://${files.accountId}.r2.cloudflarestorage.com`,
  };
});
