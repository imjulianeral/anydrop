defmodule Anyshare.ObjectStore.SignerTest do
  use ExUnit.Case, async: true

  alias Anyshare.ObjectStore.Signer

  @config %{
    access_key_id: "access",
    secret_access_key: "secret",
    bucket: "bucket",
    endpoint: "https://example.r2.cloudflarestorage.com",
    region: "auto"
  }
  @now ~U[2026-09-03 12:34:56Z]

  test "creates deterministic path-style presigned URLs" do
    url = Signer.presign(@config, :get, "transfers/2026-09-03/a file.txt", now: @now)
    parsed = URI.parse(url)
    query = URI.decode_query(parsed.query)

    assert parsed.path == "/bucket/transfers/2026-09-03/a%20file.txt"
    assert query["X-Amz-Algorithm"] == "AWS4-HMAC-SHA256"
    assert query["X-Amz-Credential"] == "access/20260903/auto/s3/aws4_request"
    assert query["X-Amz-Date"] == "20260903T123456Z"
    assert query["X-Amz-Expires"] == "900"
    assert query["X-Amz-SignedHeaders"] == "host"
    assert String.length(query["X-Amz-Signature"]) == 64
  end
end
