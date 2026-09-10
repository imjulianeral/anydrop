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

    assert query["X-Amz-Signature"] ==
             "c4612619ef76ff2f391e94aacb435d5591f70e18a8f2b371f59c0d8f6b6d8f8d"
  end

  test "signs multipart completion payloads and escaped upload IDs" do
    {url, headers} =
      Signer.signed_request(@config, :post, "transfers/a file.txt",
        now: @now,
        body: "<CompleteMultipartUpload></CompleteMultipartUpload>",
        query: [{"uploadId", "upload+/="}],
        headers: [{"content-type", "application/xml"}]
      )

    headers = Map.new(headers)

    assert url ==
             "https://example.r2.cloudflarestorage.com/bucket/transfers/a%20file.txt?uploadId=upload%2B%2F%3D"

    assert headers["x-amz-content-sha256"] ==
             "6e842b84ed8c34f3a66be9ed68a3e53471da531989f7efd4dbaf7bc54b0e1f31"

    assert headers["authorization"] ==
             "AWS4-HMAC-SHA256 Credential=access/20260903/auto/s3/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=a2c5ee3dfa46abe6ec8f202918af5e0d87b7ca6b622fde71a43e4647afdd230f"
  end
end
